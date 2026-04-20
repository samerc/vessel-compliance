import { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, FileText, UserCheck, ChevronDown, ChevronRight, ChevronUp, Shield, X, Database, Clock, Play, Loader2, Bell, ClipboardCheck, ArrowLeft, Ship, GripVertical, Tag, Edit3, Lock, Users, Download, Upload, AlertTriangle, Landmark } from 'lucide-react'
import { DocumentType, AssuredRole, FileTypeSettings, ComplianceScheduleSettings, ReminderSettings, ConditionSurveyType, PolicyType, ClassificationSociety, VesselType, PolicyTypeCharacteristic, PolicyTypeCondition, ReportSettings, UserGroup, PERMISSION_CATEGORIES, NotificationGroup, NOTIFICATION_EVENT_TYPES, EntityDocumentType } from '../../../shared/types'
import { REPORT_SETTINGS_DEFAULTS, rgbToHex, hexToRgb } from '../services/ReportSettingsService'
import { useToast } from '../contexts/ToastContext'
import { useAuth } from '../contexts/AuthContext'
import { formatDateTime } from '../utils/dateUtils'
import RichTextEditor from './RichTextEditor'

// ── Section definitions ────────────────────────────────────────────────────────
const GRANTABLE_SECTIONS = [
    { id: 'docTypes',      label: 'Document Types' },
    { id: 'entityDocTypes',label: 'Entity Document Types' },
    { id: 'roles',         label: 'Assured Roles' },
    { id: 'surveyTypes',   label: 'Survey Types' },
    { id: 'vesselTypes',   label: 'Vessel Types' },
    { id: 'classSocieties',label: 'Classification Societies' },
    { id: 'policyTypes',   label: 'Policy Types' },
    { id: 'compliance',    label: 'Compliance Schedule' },
    { id: 'reminders',     label: 'Vessel Reminders' },
    { id: 'reportSettings',label: 'Report Settings' },
]

export default function AdminPanel({ isAdmin, onNavigateToVessel }: { isAdmin?: boolean; onNavigateToVessel?: (vesselId: string) => void }) {
    const [docTypes, setDocTypes] = useState<DocumentType[]>([])
    const [newName, setNewName] = useState('')
    const [newDescription, setNewDescription] = useState('')
    const [required, setRequired] = useState(false)
    const [annualRenewal, setAnnualRenewal] = useState(false)
    const [newDocPolicyTypeIds, setNewDocPolicyTypeIds] = useState<string[]>([])
    const [editDocPolicyTypeIds, setEditDocPolicyTypeIds] = useState<string[]>([])
    // Entity Document Types state
    const [entityDocTypes, setEntityDocTypes] = useState<EntityDocumentType[]>([])
    const [newEdtName, setNewEdtName] = useState('')
    const [newEdtDescription, setNewEdtDescription] = useState('')
    const [newEdtScope, setNewEdtScope] = useState<'company' | 'person' | 'both'>('both')
    const [newEdtRequired, setNewEdtRequired] = useState(true)
    const [editingEdtId, setEditingEdtId] = useState<string | null>(null)
    const [editEdtName, setEditEdtName] = useState('')
    const [editEdtDescription, setEditEdtDescription] = useState('')
    const [editEdtScope, setEditEdtScope] = useState<'company' | 'person' | 'both'>('both')
    const [editEdtRequired, setEditEdtRequired] = useState(true)
    const dragEdtIndex = useRef<number | null>(null)
    const [dragOverEdtIndex, setDragOverEdtIndex] = useState<number | null>(null)

    const [roles, setRoles] = useState<AssuredRole[]>([])
    const [newRole, setNewRole] = useState('')
    const [surveyTypes, setSurveyTypes] = useState<ConditionSurveyType[]>([])
    const [newSurveyType, setNewSurveyType] = useState('')
    const [fileTypeSettings, setFileTypeSettings] = useState<FileTypeSettings>({ allowedExtensions: [], blockedExtensions: [] })
    const [newAllowedExt, setNewAllowedExt] = useState('')
    const [newBlockedExt, setNewBlockedExt] = useState('')
    const [fileTypeStatus, setFileTypeStatus] = useState('')
    const [configPath, setConfigPath] = useState<string | null>(null)
    const { showSuccess, showError } = useToast()
    const { hasPermission } = useAuth()
    const canSettings = hasPermission('admin:settings')

    // Compliance schedule state
    const [complianceSettings, setComplianceSettings] = useState<ComplianceScheduleSettings>({
        enabled: false,
        dayOfWeek: 1,
        timeOfDay: '09:00',
        threshold: 85,
        includeVessels: true,
        skipCleared: true,
        autoMarkCleanOnCheck: true
    })
    const [savingCompliance, setSavingCompliance] = useState(false)
    const [runningManualCheck, setRunningManualCheck] = useState(false)
    const [checkProgress, setCheckProgress] = useState<{ current: number; total: number; entityName: string } | null>(null)

    // Sidebar navigation
    const [activeSection, setActiveSection] = useState<string>('docTypes')
    const [userSectionAccess, setUserSectionAccess] = useState<string[]>([])

    const [policyTypes, setPolicyTypes] = useState<PolicyType[]>([])
    const [newPolicyType, setNewPolicyType] = useState('')
    const [newPolicyTypeCode, setNewPolicyTypeCode] = useState('')
    const [editingPolicyTypeId, setEditingPolicyTypeId] = useState<string | null>(null)
    const [editPolicyTypeName, setEditPolicyTypeName] = useState('')
    const [editPolicyTypeCode, setEditPolicyTypeCode] = useState('')

    // Classification Societies
    const [classSocieties, setClassSocieties] = useState<ClassificationSociety[]>([])
    const [newClassName, setNewClassName] = useState('')
    const [newClassAbbr, setNewClassAbbr] = useState('')
    const [newClassIacs, setNewClassIacs] = useState(false)
    const [editingClassId, setEditingClassId] = useState<string | null>(null)
    const [editClassName, setEditClassName] = useState('')
    const [editClassAbbr, setEditClassAbbr] = useState('')
    const [editClassIacs, setEditClassIacs] = useState(false)

    // Vessel Types
    const [vesselTypes, setVesselTypes] = useState<VesselType[]>([])
    const [newVesselTypeName, setNewVesselTypeName] = useState('')
    const [newVesselTypeDescription, setNewVesselTypeDescription] = useState('')
    const [editingVesselTypeId, setEditingVesselTypeId] = useState<string | null>(null)
    const [editVesselTypeName, setEditVesselTypeName] = useState('')
    const [editVesselTypeDescription, setEditVesselTypeDescription] = useState('')

    // Policy type characteristics and conditions
    const [expandedPolicyTypeId, setExpandedPolicyTypeId] = useState<string | null>(null)
    const [ptCharacteristics, setPtCharacteristics] = useState<PolicyTypeCharacteristic[]>([])
    const [ptConditions, setPtConditions] = useState<PolicyTypeCondition[]>([])
    const [newCharName, setNewCharName] = useState('')
    const [newCharType, setNewCharType] = useState<'text' | 'date' | 'amount' | 'boolean' | 'select'>('text')
    const [newCharRequired, setNewCharRequired] = useState(false)
    const [newCondName, setNewCondName] = useState('')

    const [reportSettings, setReportSettings] = useState<ReportSettings>(REPORT_SETTINGS_DEFAULTS)
    const [savingReportSettings, setSavingReportSettings] = useState(false)

    // Reminder settings state
    const DEFAULT_TEMPLATE = `Vessel: {vesselName} (IMO: {imoNumber})\n\nVessel Documents:\n{vesselDocuments}\n\nAssured Documents:\n{assuredDocuments}`
    const [reminderSettings, setReminderSettings] = useState<ReminderSettings>({ periodDays: 7, reminderTemplate: DEFAULT_TEMPLATE })
    const [savingReminder, setSavingReminder] = useState(false)
    const [annualGraceDays, setAnnualGraceDays] = useState(90)

    // User Groups state
    const [userGroups, setUserGroups] = useState<UserGroup[]>([])
    const [newGroupName, setNewGroupName] = useState('')
    const [newGroupDescription, setNewGroupDescription] = useState('')
    const [editingGroupId, setEditingGroupId] = useState<string | null>(null)
    const [editGroupName, setEditGroupName] = useState('')
    const [editGroupDescription, setEditGroupDescription] = useState('')
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
    const [groupPermissions, setGroupPermissions] = useState<string[]>([])
    const [collapsedPermCategories, setCollapsedPermCategories] = useState<Set<string>>(new Set())

    // Activity Log Retention state
    const [logRetentionDays, setLogRetentionDays] = useState<number>(365)
    const [logEntryCount, setLogEntryCount] = useState<number>(0)
    const [cleaningLog, setCleaningLog] = useState(false)
    const [savingRetention, setSavingRetention] = useState(false)

    // Backup & Restore state
    const [backupInProgress, setBackupInProgress] = useState(false)
    const [restoreInProgress, setRestoreInProgress] = useState(false)
    const [lastBackupDate, setLastBackupDate] = useState<string | null>(null)
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

    // Banks state
    const [banks, setBanks] = useState<{ id: string; name: string; details: string; order: number }[]>([])
    const [newBankName, setNewBankName] = useState('')
    const [newBankDetails, setNewBankDetails] = useState('')
    const [editingBankId, setEditingBankId] = useState<string | null>(null)
    const [editBankName, setEditBankName] = useState('')
    const [editBankDetails, setEditBankDetails] = useState('')

    // Notification Groups state
    const [notifGroups, setNotifGroups] = useState<NotificationGroup[]>([])
    const [newNotifGroupName, setNewNotifGroupName] = useState('')
    const [newNotifGroupDesc, setNewNotifGroupDesc] = useState('')
    const [selectedNotifGroupId, setSelectedNotifGroupId] = useState<string | null>(null)
    const [notifGroupMembers, setNotifGroupMembers] = useState<string[]>([])
    const [notifGroupSubs, setNotifGroupSubs] = useState<string[]>([])
    const [allUsers, setAllUsers] = useState<{ id: string; username: string }[]>([])
    const [notifGroupTab, setNotifGroupTab] = useState<'members' | 'subscriptions'>('members')
    const [editingNotifGroupId, setEditingNotifGroupId] = useState<string | null>(null)
    const [editNotifGroupName, setEditNotifGroupName] = useState('')
    const [editNotifGroupDesc, setEditNotifGroupDesc] = useState('')

    // Database Health state
    const [dbHealth, setDbHealth] = useState<{
        connected: boolean
        version: string
        databaseSize: string
        tableCount: number
        largestTables: { name: string; rows: number; sizeMB: number }[]
        lastBackup: string | null
    } | null>(null)
    const [loadingDbHealth, setLoadingDbHealth] = useState(false)

    // Daily Alerts state
    const [dailyAlertsEnabled, setDailyAlertsEnabled] = useState(false)
    const [dailyAlertsTime, setDailyAlertsTime] = useState('08:00')
    const [dailyAlertsDocDays, setDailyAlertsDocDays] = useState(30)
    const [dailyAlertsPolicyDays, setDailyAlertsPolicyDays] = useState(60)
    const [dailyAlertsBlueCardDays, setDailyAlertsBlueCardDays] = useState(30)
    const [dailyAlertsWarrantyDays, setDailyAlertsWarrantyDays] = useState(14)
    const [dailyAlertsLastRun, setDailyAlertsLastRun] = useState<string | null>(null)
    const [dailyAlertsRunning, setDailyAlertsRunning] = useState(false)

    useEffect(() => {
        loadData()
        loadFileTypeSettings()
        loadConfigPath()
        loadComplianceSettings()
        loadReminderSettings()
        loadReportSettings()
        loadUserGroups()
        loadLastBackupDate()
        loadLogRetention()
        loadBanks()
        loadNotifGroups()
        loadDailyAlerts()
        window.api.getUserSectionAccess().then(setUserSectionAccess).catch(() => {})
    }, [])

    const handleToggleUserSection = async (sectionId: string) => {
        const next = userSectionAccess.includes(sectionId)
            ? userSectionAccess.filter(id => id !== sectionId)
            : [...userSectionAccess, sectionId]
        setUserSectionAccess(next)
        await window.api.setUserSectionAccess(next)
        showSuccess('User access updated')
    }

    // ── User Groups ──────────────────────────────────────────────────────────────
    const loadUserGroups = async () => {
        try {
            const data = await window.api.rbacGetGroups()
            if (Array.isArray(data)) setUserGroups(data)
        } catch { /* ignore */ }
    }

    // ── Notification Groups ────────────────────────────────────────────────────
    const loadNotifGroups = async () => {
        try {
            const data = await window.api.notifGroupGetAll()
            if (Array.isArray(data)) setNotifGroups(data)
            const users = await window.api.getUsers()
            if (Array.isArray(users)) setAllUsers(users.map((u: any) => ({ id: u.id, username: u.username })))
        } catch { /* ignore */ }
    }

    const handleAddNotifGroup = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newNotifGroupName.trim()) return
        try {
            await window.api.notifGroupAdd(newNotifGroupName.trim(), newNotifGroupDesc.trim() || undefined)
            setNewNotifGroupName('')
            setNewNotifGroupDesc('')
            await loadNotifGroups()
            showSuccess('Notification group created')
        } catch (err: any) { showError(err?.message || 'Failed to create group') }
    }

    const handleDeleteNotifGroup = async (id: string) => {
        if (!confirm('Delete this notification group?')) return
        try {
            await window.api.notifGroupDelete(id)
            if (selectedNotifGroupId === id) setSelectedNotifGroupId(null)
            await loadNotifGroups()
            showSuccess('Group deleted')
        } catch (err: any) { showError(err?.message || 'Failed to delete group') }
    }

    const handleSelectNotifGroup = async (groupId: string) => {
        setSelectedNotifGroupId(groupId)
        setNotifGroupTab('members')
        try {
            const members = await window.api.notifGroupGetMembers(groupId)
            setNotifGroupMembers(Array.isArray(members) ? members.map((m: any) => m.id) : [])
            const subs = await window.api.notifGroupGetSubscriptions(groupId)
            setNotifGroupSubs(Array.isArray(subs) ? subs : [])
        } catch { /* ignore */ }
    }

    const handleToggleNotifMember = async (userId: string) => {
        if (!selectedNotifGroupId) return
        const next = notifGroupMembers.includes(userId)
            ? notifGroupMembers.filter(id => id !== userId)
            : [...notifGroupMembers, userId]
        setNotifGroupMembers(next)
        try {
            await window.api.notifGroupSetMembers(selectedNotifGroupId, next)
            await loadNotifGroups()
        } catch (err: any) { showError(err?.message || 'Failed to update members') }
    }

    const handleToggleNotifSub = async (eventType: string) => {
        if (!selectedNotifGroupId) return
        const next = notifGroupSubs.includes(eventType)
            ? notifGroupSubs.filter(et => et !== eventType)
            : [...notifGroupSubs, eventType]
        setNotifGroupSubs(next)
        try {
            await window.api.notifGroupSetSubscriptions(selectedNotifGroupId, next)
            await loadNotifGroups()
        } catch (err: any) { showError(err?.message || 'Failed to update subscriptions') }
    }

    const handleUpdateNotifGroup = async (id: string) => {
        if (!editNotifGroupName.trim()) return
        try {
            await window.api.notifGroupUpdate(id, editNotifGroupName.trim(), editNotifGroupDesc.trim() || undefined)
            setEditingNotifGroupId(null)
            await loadNotifGroups()
            showSuccess('Group updated')
        } catch (err: any) { showError(err?.message || 'Failed to update group') }
    }

    const handleReorderNotifGroup = async (index: number, direction: -1 | 1) => {
        const newList = [...notifGroups]
        const target = index + direction
        if (target < 0 || target >= newList.length) return
        ;[newList[index], newList[target]] = [newList[target], newList[index]]
        setNotifGroups(newList)
        try {
            await window.api.notifGroupReorder(newList.map(g => g.id))
        } catch (err: any) { showError(err?.message || 'Failed to reorder') }
    }

    // ── Daily Alerts ──────────────────────────────────────────────────────────
    const loadDailyAlerts = async () => {
        try {
            const [enabled, time, docDays, policyDays, blueCardDays, warrantyDays, lastRun] = await Promise.all([
                window.api.getSetting('daily_alerts_enabled'),
                window.api.getSetting('daily_alerts_time'),
                window.api.getSetting('daily_alerts_doc_expiry_days'),
                window.api.getSetting('daily_alerts_policy_expiry_days'),
                window.api.getSetting('daily_alerts_blue_card_days'),
                window.api.getSetting('daily_alerts_warranty_days'),
                window.api.dailyAlertsGetLastRun(),
            ])
            setDailyAlertsEnabled(enabled === 'true')
            if (time) setDailyAlertsTime(time)
            if (docDays) setDailyAlertsDocDays(parseInt(docDays, 10))
            if (policyDays) setDailyAlertsPolicyDays(parseInt(policyDays, 10))
            if (blueCardDays) setDailyAlertsBlueCardDays(parseInt(blueCardDays, 10))
            if (warrantyDays) setDailyAlertsWarrantyDays(parseInt(warrantyDays, 10))
            setDailyAlertsLastRun(lastRun)
        } catch { /* ignore */ }
    }

    const saveDailyAlertSetting = async (key: string, value: string) => {
        try {
            await window.api.setSetting(key, value)
        } catch (err: any) { showError(err?.message || 'Failed to save setting') }
    }

    const handleDailyAlertsRunNow = async () => {
        setDailyAlertsRunning(true)
        try {
            await window.api.dailyAlertsRunNow()
            showSuccess('Daily alert check completed')
            await loadDailyAlerts()
        } catch (err: any) { showError(err?.message || 'Failed to run daily alerts') }
        finally { setDailyAlertsRunning(false) }
    }

    const loadLastBackupDate = async () => {
        try {
            const date = await window.api.dbGetLastBackupDate()
            setLastBackupDate(date || null)
        } catch { /* ignore */ }
    }

    const loadLogRetention = async () => {
        try {
            const days = await window.api.activityGetRetention()
            setLogRetentionDays(typeof days === 'number' ? days : 365)
            const count = await window.api.activityGetCount()
            setLogEntryCount(typeof count === 'number' ? count : 0)
        } catch { /* ignore */ }
    }

    const handleSaveRetention = async (days: number) => {
        setSavingRetention(true)
        try {
            setLogRetentionDays(days)
            const result = await window.api.activitySetRetention(days)
            if (result?.deleted > 0) {
                showSuccess(`Retention set to ${days === 0 ? 'never delete' : days + ' days'}. Cleaned ${result.deleted} old entries.`)
            } else {
                showSuccess(`Retention set to ${days === 0 ? 'never delete' : days + ' days'}`)
            }
            await loadLogRetention()
        } catch (err: any) {
            showError(err?.message || 'Failed to save retention setting')
        } finally {
            setSavingRetention(false)
        }
    }

    const handleCleanNow = async () => {
        setCleaningLog(true)
        try {
            const result = await window.api.activityCleanup()
            if (result?.deleted > 0) {
                showSuccess(`Cleaned ${result.deleted} old log entries`)
            } else {
                showSuccess('No old entries to clean')
            }
            await loadLogRetention()
        } catch (err: any) {
            showError(err?.message || 'Failed to clean activity log')
        } finally {
            setCleaningLog(false)
        }
    }

    // ── Banks ──────────────────────────────────────────────────────────────
    const loadBanks = async () => {
        try {
            const data = await window.api.bankGetAll()
            if (Array.isArray(data)) setBanks(data)
        } catch { /* ignore */ }
    }

    const handleAddBank = async (e: React.FormEvent) => {
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

    const handleDeleteBank = async (id: string) => {
        if (!confirm('Delete this bank?')) return
        try {
            await window.api.bankDelete(id)
            await loadBanks()
            showSuccess('Bank deleted')
        } catch (err: any) {
            showError(err.message || 'Failed to delete bank')
        }
    }

    const startEditingBank = (bank: { id: string; name: string; details: string }) => {
        setEditingBankId(bank.id)
        setEditBankName(bank.name)
        setEditBankDetails(bank.details || '')
    }

    const saveBankEdit = async (id: string) => {
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

    const handleMoveBank = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...banks]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setBanks(newOrder)
        await window.api.bankReorder(newOrder.map(b => b.id))
    }

    const handleBackup = async () => {
        setBackupInProgress(true)
        try {
            const result = await window.api.dbBackup()
            if (result?.error) {
                showError(result.message || 'Backup failed')
            } else if (result?.success) {
                showSuccess('Database backup saved successfully')
                loadLastBackupDate()
            }
        } catch (err: any) {
            showError(err?.message || 'Backup failed')
        } finally {
            setBackupInProgress(false)
        }
    }

    const handleRestore = async () => {
        setShowRestoreConfirm(false)
        setRestoreInProgress(true)
        try {
            const result = await window.api.dbRestore()
            if (result?.error) {
                showError(result.message || 'Restore failed')
            } else if (result?.success) {
                showSuccess('Database restored successfully. Please reload the application.')
            }
        } catch (err: any) {
            showError(err?.message || 'Restore failed')
        } finally {
            setRestoreInProgress(false)
        }
    }

    const handleAddGroup = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newGroupName.trim()) return
        try {
            const result = await window.api.rbacAddGroup(newGroupName.trim(), newGroupDescription.trim() || undefined)
            if ((result as any)?.error) {
                showError((result as any).message || 'Failed to add group')
                return
            }
            setNewGroupName('')
            setNewGroupDescription('')
            loadUserGroups()
            showSuccess('Group created')
        } catch (err: any) {
            showError(err.message || 'Failed to add group')
        }
    }

    const handleDeleteGroup = async (id: string) => {
        if (!confirm('Delete this group? Users in this group will lose its permissions.')) return
        try {
            await window.api.rbacDeleteGroup(id)
            if (selectedGroupId === id) {
                setSelectedGroupId(null)
                setGroupPermissions([])
            }
            loadUserGroups()
            showSuccess('Group deleted')
        } catch (err: any) {
            showError(err.message || 'Failed to delete group')
        }
    }

    const startEditingGroup = (g: UserGroup) => {
        setEditingGroupId(g.id)
        setEditGroupName(g.name)
        setEditGroupDescription(g.description || '')
    }

    const saveGroupEdit = async (id: string) => {
        if (!editGroupName.trim()) return
        try {
            await window.api.rbacUpdateGroup(id, editGroupName.trim(), editGroupDescription.trim() || undefined)
            setEditingGroupId(null)
            loadUserGroups()
            showSuccess('Group updated')
        } catch (err: any) {
            showError(err.message || 'Failed to update group')
        }
    }

    const handleSelectGroup = async (groupId: string) => {
        if (selectedGroupId === groupId) {
            setSelectedGroupId(null)
            setGroupPermissions([])
            return
        }
        setSelectedGroupId(groupId)
        try {
            const perms = await window.api.rbacGetGroupPermissions(groupId)
            setGroupPermissions(Array.isArray(perms) ? perms : [])
        } catch {
            setGroupPermissions([])
        }
    }

    const handleToggleGroupPermission = async (groupId: string, permKey: string) => {
        const next = groupPermissions.includes(permKey)
            ? groupPermissions.filter(k => k !== permKey)
            : [...groupPermissions, permKey]
        setGroupPermissions(next)
        try {
            await window.api.rbacSetGroupPermissions(groupId, next)
        } catch (err: any) {
            showError(err.message || 'Failed to save permissions')
            // reload to revert
            const perms = await window.api.rbacGetGroupPermissions(groupId)
            setGroupPermissions(Array.isArray(perms) ? perms : [])
        }
    }

    const handleToggleCategoryAll = async (groupId: string, categoryPerms: readonly { key: string; label: string }[]) => {
        const keys = categoryPerms.map(p => p.key)
        const allSelected = keys.every(k => groupPermissions.includes(k))
        const next = allSelected
            ? groupPermissions.filter(k => !keys.includes(k))
            : [...new Set([...groupPermissions, ...keys])]
        setGroupPermissions(next)
        try {
            await window.api.rbacSetGroupPermissions(groupId, next)
        } catch (err: any) {
            showError(err.message || 'Failed to save permissions')
            const perms = await window.api.rbacGetGroupPermissions(groupId)
            setGroupPermissions(Array.isArray(perms) ? perms : [])
        }
    }

    const togglePermCategory = (catKey: string) => {
        setCollapsedPermCategories(prev => {
            const next = new Set(prev)
            if (next.has(catKey)) next.delete(catKey)
            else next.add(catKey)
            return next
        })
    }

    const loadConfigPath = async () => {
        try {
            const path = await window.api.setupGetConfigPath()
            if (path) setConfigPath(path)
        } catch { /* ignore */ }
    }

    const loadComplianceSettings = async () => {
        try {
            const settings = await window.api.complianceGetScheduleSettings()
            if (settings && !(settings as any).error) setComplianceSettings(settings)
        } catch { /* ignore */ }
    }

    const handleSaveComplianceSettings = async () => {
        setSavingCompliance(true)
        try {
            const result = await window.api.complianceSetScheduleSettings(complianceSettings)
            if (result.success) {
                showSuccess('Compliance schedule settings saved')
                loadComplianceSettings()
            } else {
                showError(result.message || 'Failed to save settings')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to save settings')
        } finally {
            setSavingCompliance(false)
        }
    }

    const handleRunManualCheck = async () => {
        setRunningManualCheck(true)
        setCheckProgress(null)
        const unsubscribe = window.api.onComplianceCheckProgress((data) => {
            if (data.total === 0) {
                setCheckProgress(null)
            } else {
                setCheckProgress(data)
            }
        })
        try {
            const result = await window.api.complianceRunManualCheck()
            if (result.success) {
                showSuccess('Compliance check completed successfully.')
            } else {
                showError(result.message || 'Failed to start compliance check')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to start compliance check')
        } finally {
            unsubscribe()
            setRunningManualCheck(false)
            setCheckProgress(null)
        }
    }



    const loadReminderSettings = async () => {
        try {
            const settings = await window.api.remindersGetSettings()
            if (settings && !(settings as any).error) setReminderSettings(settings)
            const grace = await window.api.getSetting('annual_grace_days')
            if (grace) setAnnualGraceDays(parseInt(grace) || 90)
        } catch { /* ignore */ }
    }

    const loadReportSettings = async () => {
        const settings = await window.api.reportSettingsGet()
        setReportSettings({ ...REPORT_SETTINGS_DEFAULTS, ...settings })
    }

    const handleSaveReportSettings = async () => {
        setSavingReportSettings(true)
        try {
            await window.api.reportSettingsSet(reportSettings)
            showSuccess('Report settings saved')
        } catch (error: any) {
            showError(error.message || 'Failed to save report settings')
        } finally {
            setSavingReportSettings(false)
        }
    }

    const handleSaveReminderSettings = async () => {
        setSavingReminder(true)
        try {
            await window.api.remindersSetSettings(reminderSettings)
            await window.api.setSetting('annual_grace_days', String(annualGraceDays))
            showSuccess('Reminder settings saved')
        } catch (error: any) {
            showError(error.message || 'Failed to save reminder settings')
        } finally {
            setSavingReminder(false)
        }
    }

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

    const loadData = async () => {
        await loadDocTypes()
        await loadEntityDocTypes()
        await loadRoles()
        await loadSurveyTypes()
        await loadClassSocieties()
        await loadVesselTypes()
        await loadPolicyTypes()
    }

    const loadPolicyTypes = async () => {
        const data = await window.api.getPolicyTypes()
        setPolicyTypes(Array.isArray(data) ? data : [])
    }

    const handleAddPolicyType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newPolicyType.trim()) return
        await window.api.addPolicyType(newPolicyType.trim(), newPolicyTypeCode.trim() || undefined)
        setNewPolicyType('')
        setNewPolicyTypeCode('')
        loadPolicyTypes()
        showSuccess('Policy type added')
    }

    const handleDeletePolicyType = async (id: string) => {
        if (!confirm('Delete this policy type? It will be removed from all vessels.')) return
        await window.api.deletePolicyType(id)
        loadPolicyTypes()
        showSuccess('Policy type deleted')
    }

    const startEditingPolicyType = (pt: PolicyType) => {
        setEditingPolicyTypeId(pt.id)
        setEditPolicyTypeName(pt.name)
        setEditPolicyTypeCode(pt.code || '')
    }

    const savePolicyTypeEdit = async (id: string) => {
        if (!editPolicyTypeName.trim()) return
        await window.api.updatePolicyType(id, { name: editPolicyTypeName.trim(), code: editPolicyTypeCode.trim() || undefined })
        setEditingPolicyTypeId(null)
        loadPolicyTypes()
        showSuccess('Policy type updated')
    }

    const handleMovePolicyType = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...policyTypes]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setPolicyTypes(newOrder)
        await window.api.reorderPolicyTypes(newOrder.map(p => p.id))
    }

    // --- Classification Societies ---
    const loadClassSocieties = async () => {
        const data = await window.api.getClassificationSocieties()
        const safe = Array.isArray(data) ? data : []
        setClassSocieties([...safe].sort((a, b) => a.name.localeCompare(b.name)))
    }

    const handleAddClassSociety = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newClassName.trim()) return
        await window.api.addClassificationSociety({ name: newClassName.trim(), abbreviation: newClassAbbr.trim(), isIacs: newClassIacs, order: classSocieties.length })
        setNewClassName(''); setNewClassAbbr(''); setNewClassIacs(false)
        loadClassSocieties()
        showSuccess('Classification society added')
    }

    const handleDeleteClassSociety = async (id: string) => {
        if (!confirm('Delete this classification society?')) return
        await window.api.deleteClassificationSociety(id)
        loadClassSocieties()
        showSuccess('Classification society deleted')
    }

    const handleMoveClassSociety = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...classSocieties]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setClassSocieties(newOrder)
        await window.api.reorderClassificationSocieties(newOrder.map(c => c.id))
    }

    const saveClassSocietyEdit = async (id: string) => {
        if (!editClassName.trim()) return
        await window.api.updateClassificationSociety(id, { name: editClassName.trim(), abbreviation: editClassAbbr.trim(), isIacs: editClassIacs })
        setEditingClassId(null)
        loadClassSocieties()
        showSuccess('Classification society updated')
    }

    // --- Vessel Types ---
    const loadVesselTypes = async () => {
        const data = await window.api.getVesselTypes()
        setVesselTypes(Array.isArray(data) ? data : [])
    }

    const handleAddVesselType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newVesselTypeName.trim()) return
        await window.api.addVesselType({ name: newVesselTypeName.trim(), description: newVesselTypeDescription.trim() || undefined, order: vesselTypes.length })
        setNewVesselTypeName('')
        setNewVesselTypeDescription('')
        loadVesselTypes()
        showSuccess('Vessel type added')
    }

    const handleDeleteVesselType = async (id: string) => {
        if (!confirm('Delete this vessel type?')) return
        await window.api.deleteVesselType(id)
        loadVesselTypes()
        showSuccess('Vessel type deleted')
    }

    const handleMoveVesselType = async (index: number, direction: 'up' | 'down') => {
        const newOrder = [...vesselTypes]
        const swapIndex = direction === 'up' ? index - 1 : index + 1
        if (swapIndex < 0 || swapIndex >= newOrder.length) return
            ;[newOrder[index], newOrder[swapIndex]] = [newOrder[swapIndex], newOrder[index]]
        setVesselTypes(newOrder)
        await window.api.reorderVesselTypes(newOrder.map(v => v.id))
    }

    const saveVesselTypeEdit = async (id: string) => {
        if (!editVesselTypeName.trim()) return
        await window.api.updateVesselType(id, { name: editVesselTypeName.trim(), description: editVesselTypeDescription.trim() || undefined })
        setEditingVesselTypeId(null)
        loadVesselTypes()
        showSuccess('Vessel type updated')
    }

    // --- Policy Type Characteristics & Conditions ---
    const loadPolicyTypeDetails = async (policyTypeId: string) => {
        const [chars, conds] = await Promise.all([
            window.api.getPolicyTypeCharacteristics(policyTypeId),
            window.api.getPolicyTypeConditions(policyTypeId)
        ])
        setPtCharacteristics(chars)
        setPtConditions(conds)
    }

    const toggleExpandPolicyType = async (ptId: string) => {
        if (expandedPolicyTypeId === ptId) {
            setExpandedPolicyTypeId(null)
        } else {
            setExpandedPolicyTypeId(ptId)
            await loadPolicyTypeDetails(ptId)
        }
    }

    const handleAddCharacteristic = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCharName.trim() || !expandedPolicyTypeId) return
        await window.api.addPolicyTypeCharacteristic({
            policyTypeId: expandedPolicyTypeId,
            name: newCharName.trim(),
            fieldType: newCharType,
            isRequired: newCharRequired,
            order: ptCharacteristics.length
        })
        setNewCharName(''); setNewCharType('text'); setNewCharRequired(false)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Characteristic added')
    }

    const handleDeleteCharacteristic = async (id: string) => {
        if (!expandedPolicyTypeId) return
        await window.api.deletePolicyTypeCharacteristic(id)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Characteristic deleted')
    }

    const handleAddCondition = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newCondName.trim() || !expandedPolicyTypeId) return
        await window.api.addPolicyTypeCondition({
            policyTypeId: expandedPolicyTypeId,
            name: newCondName.trim(),
            order: ptConditions.length
        })
        setNewCondName('')
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Condition added')
    }

    const handleDeleteCondition = async (id: string) => {
        if (!expandedPolicyTypeId) return
        await window.api.deletePolicyTypeCondition(id)
        loadPolicyTypeDetails(expandedPolicyTypeId)
        showSuccess('Condition deleted')
    }

    const loadDocTypes = async () => {
        const raw = await window.api.getDocumentTypes()
        const data = Array.isArray(raw) ? raw : []

        // Normalize orders: ensure every doc has a unique sequential order
        // Sort by existing order first, handling undefined/NaN
        const sorted = [...data].sort((a, b) => {
            const oa = (a.order === undefined || isNaN(a.order)) ? 999 : a.order
            const ob = (b.order === undefined || isNaN(b.order)) ? 999 : b.order
            return oa - ob
        })

        // Check if we need to fix the orders (if they are not unique sequential 1, 2, 3...)
        let needsFix = false
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i].order !== i + 1) {
                needsFix = true
                break
            }
        }

        if (needsFix && sorted.length > 0) {
            // Apply new sequential orders starting at 1
            for (let i = 0; i < sorted.length; i++) {
                const newOrderVal = i + 1
                await window.api.updateDocumentType(sorted[i].id, { order: newOrderVal })
                sorted[i].order = newOrderVal
            }
        }

        setDocTypes(sorted)
    }

    // --- Entity Document Types ---
    const loadEntityDocTypes = async () => {
        const data = await window.api.getEntityDocumentTypes()
        setEntityDocTypes(Array.isArray(data) ? data : [])
    }

    const handleAddEntityDocType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newEdtName.trim()) return
        await window.api.addEntityDocumentType({ name: newEdtName, description: newEdtDescription, entityScope: newEdtScope, isRequired: newEdtRequired, orderIndex: entityDocTypes.length + 1, isActive: true })
        setNewEdtName('')
        setNewEdtDescription('')
        setNewEdtScope('both')
        setNewEdtRequired(true)
        await loadEntityDocTypes()
    }

    const handleDeleteEntityDocType = async (id: string) => {
        if (confirm('Delete this entity document type? All uploaded entity documents of this type will be removed.')) {
            await window.api.deleteEntityDocumentType(id)
            await loadEntityDocTypes()
        }
    }

    const saveEdtEdit = async (id: string) => {
        if (!editEdtName.trim()) return
        await window.api.updateEntityDocumentType(id, { name: editEdtName, description: editEdtDescription, entityScope: editEdtScope, isRequired: editEdtRequired })
        setEditingEdtId(null)
        await loadEntityDocTypes()
    }

    const handleEdtToggleActive = async (id: string, isActive: boolean) => {
        await window.api.updateEntityDocumentType(id, { isActive: !isActive })
        await loadEntityDocTypes()
    }

    const handleEdtDragStart = (index: number) => { dragEdtIndex.current = index }
    const handleEdtDragOver = (e: React.DragEvent, index: number) => { e.preventDefault(); setDragOverEdtIndex(index) }
    const handleEdtDrop = async (e: React.DragEvent, dropIndex: number) => {
        e.preventDefault()
        setDragOverEdtIndex(null)
        if (dragEdtIndex.current === null || dragEdtIndex.current === dropIndex) return
        const reordered = [...entityDocTypes]
        const [moved] = reordered.splice(dragEdtIndex.current, 1)
        reordered.splice(dropIndex, 0, moved)
        dragEdtIndex.current = null
        for (let i = 0; i < reordered.length; i++) {
            await window.api.updateEntityDocumentType(reordered[i].id, { orderIndex: i + 1 })
        }
        await loadEntityDocTypes()
    }

    const loadRoles = async () => {
        const data = await window.api.getAssuredRoles()
        setRoles(Array.isArray(data) ? data : [])
    }

    const loadSurveyTypes = async () => {
        const data = await window.api.getConditionSurveyTypes()
        setSurveyTypes(Array.isArray(data) ? data : [])
    }

    const handleAddDocType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newName.trim()) return
        await window.api.addDocumentType({ name: newName, description: newDescription, required, annualRenewal, order: docTypes.length + 1, policyTypeIds: newDocPolicyTypeIds })
        setNewName('')
        setNewDescription('')
        setRequired(false)
        setAnnualRenewal(false)
        setNewDocPolicyTypeIds([])
        await loadDocTypes()
    }

    const handleDeleteDocType = async (id: string) => {
        if (confirm('Delete this document type? It will be removed from all vessels.')) {
            await window.api.deleteDocumentType(id)
            await loadDocTypes()
        }
    }

    const handleDocDragStart = (index: number) => {
        dragDocIndex.current = index
    }

    const handleDocDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragOverDocIndex !== index) setDragOverDocIndex(index)
    }

    const handleDocDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        setDragOverDocIndex(null)
        const fromIndex = dragDocIndex.current
        if (fromIndex === null || fromIndex === targetIndex) return
        dragDocIndex.current = null

        const reordered = [...docTypes]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(targetIndex, 0, moved)

        // Optimistic UI update
        for (let i = 0; i < reordered.length; i++) {
            reordered[i] = { ...reordered[i], order: i + 1 }
        }
        setDocTypes(reordered)

        // Persist to DB
        for (let i = 0; i < reordered.length; i++) {
            await window.api.updateDocumentType(reordered[i].id, { order: i + 1 })
        }
    }

    const handleRoleDragStart = (index: number) => {
        dragRoleIndex.current = index
    }

    const handleRoleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (dragOverRoleIndex !== index) setDragOverRoleIndex(index)
    }

    const handleRoleDrop = async (e: React.DragEvent, targetIndex: number) => {
        e.preventDefault()
        setDragOverRoleIndex(null)
        const fromIndex = dragRoleIndex.current
        if (fromIndex === null || fromIndex === targetIndex) return
        dragRoleIndex.current = null

        const reordered = [...roles]
        const [moved] = reordered.splice(fromIndex, 1)
        reordered.splice(targetIndex, 0, moved)

        // Optimistic UI update
        setRoles(reordered)

        // Persist to DB
        await window.api.reorderAssuredRoles(reordered.map(r => r.id))
    }

    const handleAddRole = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newRole.trim()) return
        if (roles.some(r => r.name.toLowerCase() === newRole.trim().toLowerCase())) {
            showError('This role already exists')
            return
        }
        await window.api.addAssuredRole({ name: newRole })
        setNewRole('')
        await loadRoles()
    }

    const handleDeleteRole = async (id: string) => {
        if (confirm('Delete this role? Existing vessel assignments will keep the name but the role will be removed from suggestions.')) {
            await window.api.deleteAssuredRole(id)
            await loadRoles()
        }
    }

    const [roleVesselPopup, setRoleVesselPopup] = useState<{ roleName: string; vessels: { id: string; name: string; imoNumber: string }[] } | null>(null)

    const handleShowRoleVessels = async (role: AssuredRole) => {
        if ((role.vesselCount || 0) === 0) return
        const vessels = await window.api.getVesselsByRole(role.name)
        setRoleVesselPopup({ roleName: role.name, vessels: Array.isArray(vessels) ? vessels : [] })
    }

    const handleAddSurveyType = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newSurveyType.trim()) return
        await window.api.addConditionSurveyType(newSurveyType)
        setNewSurveyType('')
        await loadSurveyTypes()
    }

    const handleDeleteSurveyType = async (id: string) => {
        if (confirm('Delete this survey type? Existing surveys will keep their type.')) {
            await window.api.deleteConditionSurveyType(id)
            await loadSurveyTypes()
        }
    }



    const [editingDocId, setEditingDocId] = useState<string | null>(null)
    const [editDocName, setEditDocName] = useState('')
    const [editDocDescription, setEditDocDescription] = useState('')
    const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
    const [editRoleName, setEditRoleName] = useState('')

    // Drag-to-reorder state
    const dragDocIndex = useRef<number | null>(null)
    const dragRoleIndex = useRef<number | null>(null)
    const [dragOverDocIndex, setDragOverDocIndex] = useState<number | null>(null)
    const [dragOverRoleIndex, setDragOverRoleIndex] = useState<number | null>(null)

    const startEditingDoc = (doc: DocumentType) => {
        setEditingDocId(doc.id)
        setEditDocName(doc.name)
        setEditDocDescription(doc.description || '')
        setEditDocPolicyTypeIds(doc.policyTypeIds || [])
    }

    const saveDocEdit = async (id: string) => {
        if (!editDocName.trim()) return
        await window.api.updateDocumentType(id, { name: editDocName, description: editDocDescription, policyTypeIds: editDocPolicyTypeIds })
        setEditingDocId(null)
        await loadDocTypes()
    }

    const startEditingRole = (role: AssuredRole) => {
        setEditingRoleId(role.id)
        setEditRoleName(role.name)
    }

    const saveRoleEdit = async (id: string) => {
        if (!editRoleName.trim()) return
        await window.api.updateAssuredRole(id, { name: editRoleName })
        setEditingRoleId(null)
        await loadRoles()
    }

    const handleToggleDocRequired = async (doc: DocumentType) => {
        await window.api.updateDocumentType(doc.id, { required: !doc.required })
        await loadDocTypes()
    }

    const handleToggleAnnualRenewal = async (doc: DocumentType) => {
        await window.api.updateDocumentType(doc.id, { annualRenewal: !doc.annualRenewal })
        await loadDocTypes()
    }

    const loadFileTypeSettings = async () => {
        const settings = await window.api.fileTypesGetSettings()
        setFileTypeSettings(settings)
    }

    const handleAddAllowedExt = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newAllowedExt.trim()) return

        const ext = newAllowedExt.trim().toLowerCase().startsWith('.') ? newAllowedExt.trim().toLowerCase() : `.${newAllowedExt.trim().toLowerCase()}`

        if (fileTypeSettings.allowedExtensions.includes(ext)) {
            setFileTypeStatus('Extension already in allowed list')
            setTimeout(() => setFileTypeStatus(''), 3000)
            return
        }

        const updated = {
            ...fileTypeSettings,
            allowedExtensions: [...fileTypeSettings.allowedExtensions, ext]
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setNewAllowedExt('')
        setFileTypeStatus('✓ Allowed extension added')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleAddBlockedExt = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newBlockedExt.trim()) return

        const ext = newBlockedExt.trim().toLowerCase().startsWith('.') ? newBlockedExt.trim().toLowerCase() : `.${newBlockedExt.trim().toLowerCase()}`

        if (fileTypeSettings.blockedExtensions.includes(ext)) {
            setFileTypeStatus('Extension already in blocked list')
            setTimeout(() => setFileTypeStatus(''), 3000)
            return
        }

        const updated = {
            ...fileTypeSettings,
            blockedExtensions: [...fileTypeSettings.blockedExtensions, ext]
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setNewBlockedExt('')
        setFileTypeStatus('✓ Blocked extension added')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleRemoveAllowedExt = async (ext: string) => {
        const updated = {
            ...fileTypeSettings,
            allowedExtensions: fileTypeSettings.allowedExtensions.filter(e => e !== ext)
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setFileTypeStatus('✓ Allowed extension removed')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleRemoveBlockedExt = async (ext: string) => {
        const updated = {
            ...fileTypeSettings,
            blockedExtensions: fileTypeSettings.blockedExtensions.filter(e => e !== ext)
        }

        const saved = await window.api.fileTypesSetSettings(updated)
        setFileTypeSettings(saved)
        setFileTypeStatus('✓ Blocked extension removed')
        setTimeout(() => setFileTypeStatus(''), 3000)
    }

    const handleBrowseConfigFile = async () => {
        const filePath = await window.api.setupSelectConfigFile()
        if (filePath) {
            const result = await window.api.setupLoadConfigFromFile(filePath)
            if (result.success) {
                window.location.reload()
            } else {
                alert(result.message || 'Failed to load configuration')
            }
        }
    }

    const handleBrowseConfigDir = async () => {
        const dir = await window.api.setupSelectDirectory()
        if (dir) {
            const result = await window.api.setupLoadConfigFromDir(dir)
            if (result.success) {
                window.location.reload()
            } else {
                alert(result.message || 'Failed to load configuration')
            }
        }
    }

    // Full-page view for vessels by role
    if (roleVesselPopup) {
        return (
            <div className="fade-in">
                <button onClick={() => setRoleVesselPopup(null)} className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <ArrowLeft size={18} /> Back to Settings
                </button>
                <header style={{ marginBottom: '24px' }}>
                    <h1 style={{ fontSize: '2rem', marginBottom: '8px' }}>Vessels with role: {roleVesselPopup.roleName}</h1>
                    <p style={{ color: 'var(--text-secondary)' }}>{roleVesselPopup.vessels.length} vessel{roleVesselPopup.vessels.length !== 1 ? 's' : ''} assigned</p>
                </header>
                {roleVesselPopup.vessels.length === 0 ? (
                    <div className="glass-card" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        <Ship size={48} style={{ opacity: 0.2, marginBottom: '16px' }} />
                        <p>No vessels found with this role.</p>
                    </div>
                ) : (
                    <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Vessels with role {roleVesselPopup.roleName}</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Vessel Name</th>
                                    <th scope="col" style={{ padding: '16px' }}>IMO Number</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roleVesselPopup.vessels.map(v => (
                                    <tr key={v.id} style={{ borderBottom: '1px solid var(--table-border)' }} className="hover-effect">
                                        <td style={{ padding: '16px', fontWeight: '600' }}>{v.name}</td>
                                        <td style={{ padding: '16px', color: 'var(--text-secondary)' }}>{v.imoNumber}</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            {onNavigateToVessel && (
                                                <button
                                                    onClick={() => {
                                                        setRoleVesselPopup(null)
                                                        onNavigateToVessel(v.id)
                                                    }}
                                                    className="btn-primary"
                                                    style={{ padding: '6px 12px', fontSize: '0.85rem' }}
                                                >
                                                    Open
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        )
    }

    // Sections visible in sidebar
    const sidebarSections: { id: string; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
        ...(isAdmin ? [{ id: 'userAccess', label: 'User Access', icon: <UserCheck size={16} />, adminOnly: true }] : []),
        ...(isAdmin || userSectionAccess.includes('docTypes') ? [{ id: 'docTypes', label: 'Document Types', icon: <FileText size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('entityDocTypes') ? [{ id: 'entityDocTypes', label: 'Entity Document Types', icon: <FileText size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('roles') ? [{ id: 'roles', label: 'Assured Roles', icon: <UserCheck size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('surveyTypes') ? [{ id: 'surveyTypes', label: 'Survey Types', icon: <ClipboardCheck size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('vesselTypes') ? [{ id: 'vesselTypes', label: 'Vessel Types', icon: <Ship size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('classSocieties') ? [{ id: 'classSocieties', label: 'Classification Societies', icon: <Tag size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('policyTypes') ? [{ id: 'policyTypes', label: 'Policy Types', icon: <Shield size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('compliance') ? [{ id: 'compliance', label: 'Compliance Schedule', icon: <Clock size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('reminders') ? [{ id: 'reminders', label: 'Vessel Reminders', icon: <Bell size={16} /> }] : []),
        ...(isAdmin || userSectionAccess.includes('reportSettings') ? [{ id: 'reportSettings', label: 'Report Settings', icon: <FileText size={16} /> }] : []),
        ...(isAdmin ? [
            { id: 'banks', label: 'Banks', icon: <Landmark size={16} />, adminOnly: true },
            { id: 'policySettings', label: 'Policy Settings', icon: <Clock size={16} />, adminOnly: true },
            { id: 'userGroups', label: 'User Groups', icon: <Users size={16} />, adminOnly: true },
            { id: 'notifGroups', label: 'Notification Groups', icon: <Bell size={16} />, adminOnly: true },
            { id: 'dailyAlerts', label: 'Daily Alerts', icon: <Clock size={16} />, adminOnly: true },
            { id: 'fileTypes', label: 'File Upload Security', icon: <Shield size={16} />, adminOnly: true },
            { id: 'logRetention', label: 'Log Retention', icon: <Clock size={16} />, adminOnly: true },
            { id: 'backup', label: 'Backup & Restore', icon: <Download size={16} />, adminOnly: true },
            { id: 'dbConfig', label: 'Database', icon: <Database size={16} />, adminOnly: true },
        ] : []),
    ]

    // Auto-select first visible section if activeSection not visible
    const visibleIds = sidebarSections.map(s => s.id)
    const effectiveSection = visibleIds.includes(activeSection) ? activeSection : (visibleIds[0] || '')

    return (
        <div className="fade-in" style={{ display: 'flex', height: 'calc(100vh - 60px)', margin: '-24px', overflow: 'hidden' }}>
            {/* ── Left sidebar ── */}
            <aside style={{ width: '220px', flexShrink: 0, background: 'var(--bg-sidebar)', borderRight: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
                <div style={{ padding: '20px 16px 12px', borderBottom: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>Settings</div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{isAdmin ? 'Administrator' : 'User'}</div>
                </div>
                <nav style={{ flex: 1, padding: '8px 0' }}>
                    {(() => {
                        const grantable = sidebarSections.filter(s => !s.adminOnly)
                        const adminSystemSections = sidebarSections.filter(s => s.adminOnly)

                        const renderBtn = (sec: typeof sidebarSections[0], isDanger = false) => {
                            const isActive = effectiveSection === sec.id
                            return (
                                <button
                                    key={sec.id}
                                    onClick={() => setActiveSection(sec.id)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '10px',
                                        padding: '9px 16px', width: '100%', textAlign: 'left',
                                        background: isActive
                                            ? isDanger ? 'rgba(255,77,77,0.1)' : 'rgba(var(--accent-primary-rgb,0,210,255),0.1)'
                                            : 'transparent',
                                        border: 'none',
                                        borderLeft: isActive
                                            ? isDanger ? '3px solid var(--danger)' : '3px solid var(--accent-primary)'
                                            : '3px solid transparent',
                                        color: isActive
                                            ? isDanger ? 'var(--danger)' : 'var(--accent-primary)'
                                            : isDanger ? 'var(--danger)' : 'var(--text-primary)',
                                        fontWeight: isActive ? '600' : '400',
                                        fontSize: '0.82rem', cursor: 'pointer',
                                    }}
                                >
                                    {sec.icon}
                                    {sec.label}
                                </button>
                            )
                        }

                        const groupLabel = (text: string, color = 'var(--text-secondary)') => (
                            <div style={{ padding: '8px 16px 2px', fontSize: '0.65rem', fontWeight: '700', letterSpacing: '0.9px', textTransform: 'uppercase', color }}>
                                {text}
                            </div>
                        )
                        const divider = (key: string) => (
                            <div key={key} style={{ height: '1px', background: 'var(--glass-border)', margin: '8px 16px', opacity: 0.5 }} />
                        )

                        if (isAdmin) {
                            const shared = grantable.filter(s => userSectionAccess.includes(s.id))
                            const adminOnly = grantable.filter(s => !userSectionAccess.includes(s.id))
                            return (
                                <>
                                    {shared.length > 0 && (
                                        <>
                                            {groupLabel('Shared with Users', 'var(--accent-primary)')}
                                            {shared.map(s => renderBtn(s))}
                                        </>
                                    )}
                                    {adminOnly.length > 0 && (
                                        <>
                                            {shared.length > 0 && divider('div-grantable')}
                                            {groupLabel('Admin Only')}
                                            {adminOnly.map(s => renderBtn(s))}
                                        </>
                                    )}
                                    {adminSystemSections.length > 0 && (
                                        <>
                                            {divider('div-admin')}
                                            {groupLabel('Administration')}
                                            {adminSystemSections.map(s => renderBtn(s, s.id === 'dangerZone'))}
                                        </>
                                    )}
                                </>
                            )
                        }

                        // Regular user — show their accessible sections, or empty state
                        if (grantable.length === 0) {
                            return (
                                <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                                    <Lock size={28} style={{ opacity: 0.25, marginBottom: '10px' }} />
                                    <p style={{ margin: 0 }}>No sections available.</p>
                                </div>
                            )
                        }
                        return <>{grantable.map(s => renderBtn(s))}</>
                    })()}
                </nav>
            </aside>

            {/* ── Content area ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px' }}>

            {/* Read-only notice when user lacks admin:settings permission */}
            {!canSettings && sidebarSections.length > 0 && (
                <div style={{ padding: '12px 16px', marginBottom: '16px', borderRadius: '8px', background: 'rgba(255, 180, 0, 0.1)', border: '1px solid rgba(255, 180, 0, 0.3)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    You do not have permission to modify settings. Viewing in read-only mode.
                </div>
            )}

            {/* Empty state for regular users with no access */}
            {!isAdmin && sidebarSections.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: '16px', textAlign: 'center' }}>
                    <Lock size={48} style={{ opacity: 0.15 }} />
                    <div>
                        <p style={{ fontWeight: '600', marginBottom: '6px' }}>No settings available</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>Your administrator has not granted access to any settings sections.</p>
                    </div>
                </div>
            )}

            <fieldset disabled={!canSettings} style={{ border: 'none', padding: 0, margin: 0 }}>
            {/* User Access - admin only */}
            {effectiveSection === 'userAccess' && isAdmin && (
                <section className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UserCheck size={20} color="var(--accent-primary)" /> User Access Control
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Choose which settings sections are visible to regular users. Admins always see all sections.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px' }}>
                        {GRANTABLE_SECTIONS.map(sec => (
                            <label key={sec.id} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderRadius: '10px', border: '1px solid var(--table-border)', cursor: 'pointer', background: userSectionAccess.includes(sec.id) ? 'rgba(var(--accent-primary-rgb,0,210,255),0.06)' : 'transparent' }}>
                                <input
                                    type="checkbox"
                                    checked={userSectionAccess.includes(sec.id)}
                                    onChange={() => handleToggleUserSection(sec.id)}
                                    style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px', flexShrink: 0 }}
                                />
                                <div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: '600', color: 'var(--text-primary)' }}>{sec.label}</div>
                                </div>
                            </label>
                        ))}
                    </div>
                </section>
            )}

            {/* 1. Document Types */}
            {effectiveSection === 'docTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="var(--accent-primary)" /> Document Types
                </h3>
                <form onSubmit={handleAddDocType} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
                        <input
                            type="text"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            style={{ width: '100%', marginBottom: '12px' }}
                            placeholder="e.g. Safety Management Certificate"
                            aria-label="Document type name"
                        />
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description (optional)</label>
                        <textarea
                            value={newDescription}
                            onChange={e => setNewDescription(e.target.value)}
                            style={{ width: '100%', minHeight: '60px', resize: 'vertical' }}
                            placeholder="Brief description of the document purposes..."
                            aria-label="Document type description"
                        />
                    </div>
                    <div style={{ width: '1px' }}></div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%', marginTop: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <input
                                type="checkbox"
                                checked={required}
                                onChange={e => setRequired(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                aria-label="Required by default"
                            />
                            Required by default
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <input
                                type="checkbox"
                                checked={annualRenewal}
                                onChange={e => setAnnualRenewal(e.target.checked)}
                                style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                aria-label="Annual renewal"
                            />
                            Annual Renewal
                        </label>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                            <Plus size={18} /> Add Document Type
                        </button>
                    </div>
                    {policyTypes.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginTop: '8px', marginBottom: '8px' }}>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Policy Types:</span>
                            <button type="button" onClick={() => setNewDocPolicyTypeIds([])}
                                style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', border: newDocPolicyTypeIds.length === 0 ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: newDocPolicyTypeIds.length === 0 ? 'rgba(0,170,200,0.08)' : 'transparent', color: newDocPolicyTypeIds.length === 0 ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: newDocPolicyTypeIds.length === 0 ? 600 : 400 }}>
                                All
                            </button>
                            {policyTypes.filter(pt => pt.code).map(pt => (
                                <label key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.8rem', padding: '2px 8px', borderRadius: '4px', border: newDocPolicyTypeIds.includes(pt.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: newDocPolicyTypeIds.includes(pt.id) ? 'rgba(0,170,200,0.08)' : 'transparent', color: newDocPolicyTypeIds.includes(pt.id) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={newDocPolicyTypeIds.includes(pt.id)} onChange={e => { if (e.target.checked) setNewDocPolicyTypeIds(prev => [...prev, pt.id]); else setNewDocPolicyTypeIds(prev => prev.filter(id => id !== pt.id)) }} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                    {pt.name}
                                </label>
                            ))}
                        </div>
                    )}
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Document types configuration</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                    <th scope="col" style={{ padding: '16px' }}>Document Type</th>
                                    <th scope="col" style={{ padding: '16px' }}>Status</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {docTypes.map((doc, index) => (
                                    <tr
                                        key={doc.id}
                                        draggable
                                        onDragStart={() => handleDocDragStart(index)}
                                        onDragOver={(e) => handleDocDragOver(e, index)}
                                        onDrop={(e) => handleDocDrop(e, index)}
                                        onDragEnd={() => { dragDocIndex.current = null; setDragOverDocIndex(null) }}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            opacity: dragDocIndex.current === index ? 0.5 : 1,
                                            background: dragOverDocIndex === index ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
                                            cursor: 'grab'
                                        }}
                                    >
                                        <td style={{ padding: '20px 16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <GripVertical size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '20px', textAlign: 'center' }}>{index + 1}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '20px 16px' }}>
                                            {editingDocId === doc.id ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <input
                                                        type="text"
                                                        value={editDocName}
                                                        onChange={e => setEditDocName(e.target.value)}
                                                        autoFocus
                                                        style={{ width: '100%' }}
                                                        aria-label="Edit document type name"
                                                    />
                                                    <textarea
                                                        value={editDocDescription}
                                                        onChange={e => setEditDocDescription(e.target.value)}
                                                        placeholder="Description..."
                                                        style={{ width: '100%', minHeight: '60px', borderRadius: '8px' }}
                                                        aria-label="Edit document type description"
                                                    />
                                                    {policyTypes.filter(pt => pt.code).length > 0 && (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>Policy Types:</span>
                                                            <button type="button" onClick={() => setEditDocPolicyTypeIds([])}
                                                                style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', border: editDocPolicyTypeIds.length === 0 ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: editDocPolicyTypeIds.length === 0 ? 'rgba(0,170,200,0.08)' : 'transparent', color: editDocPolicyTypeIds.length === 0 ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: editDocPolicyTypeIds.length === 0 ? 600 : 400 }}>
                                                                All
                                                            </button>
                                                            {policyTypes.filter(pt => pt.code).map(pt => (
                                                                <label key={pt.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', fontSize: '0.75rem', padding: '1px 6px', borderRadius: '4px', border: editDocPolicyTypeIds.includes(pt.id) ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: editDocPolicyTypeIds.includes(pt.id) ? 'rgba(0,170,200,0.08)' : 'transparent', color: editDocPolicyTypeIds.includes(pt.id) ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                                                    <input type="checkbox" checked={editDocPolicyTypeIds.includes(pt.id)} onChange={e => { if (e.target.checked) setEditDocPolicyTypeIds(prev => [...prev, pt.id]); else setEditDocPolicyTypeIds(prev => prev.filter(id => id !== pt.id)) }} style={{ width: '12px', height: '12px', accentColor: 'var(--accent-primary)' }} />
                                                                    {pt.name}
                                                                </label>
                                                            ))}
                                                        </div>
                                                    )}
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button onClick={() => saveDocEdit(doc.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                        <button onClick={() => setEditingDocId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div onClick={() => startEditingDoc(doc)} style={{ cursor: 'pointer' }}>
                                                    <div style={{ fontWeight: '600' }}>{doc.name}</div>
                                                    {doc.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>{doc.description}</div>}
                                                    <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                                                        {(!doc.policyTypeIds || doc.policyTypeIds.length === 0)
                                                            ? <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,200,100,0.1)', color: '#00c864' }}>All Types</span>
                                                            : doc.policyTypeIds.map(ptId => {
                                                                const pt = policyTypes.find(p => p.id === ptId)
                                                                return pt ? <span key={ptId} style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '3px', background: 'rgba(0,170,200,0.1)', color: 'var(--accent-primary)' }}>{pt.name}</span> : null
                                                            })
                                                        }
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '20px 16px' }}>
                                            <span
                                                onClick={() => handleToggleDocRequired(doc)}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    background: doc.required ? 'rgba(255, 77, 77, 0.1)' : 'var(--table-header-bg)',
                                                    color: doc.required ? 'var(--danger)' : 'var(--text-secondary)',
                                                    border: doc.required ? '1px solid rgba(255, 77, 77, 0.2)' : '1px solid var(--table-border)',
                                                    cursor: 'pointer'
                                                }}
                                            >{doc.required ? 'REQUIRED' : 'OPTIONAL'}</span>
                                            {' '}
                                            <span
                                                onClick={() => handleToggleAnnualRenewal(doc)}
                                                style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.75rem',
                                                    background: doc.annualRenewal ? 'rgba(59, 130, 246, 0.1)' : 'var(--table-header-bg)',
                                                    color: doc.annualRenewal ? '#60a5fa' : 'var(--text-secondary)',
                                                    border: doc.annualRenewal ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--table-border)',
                                                    cursor: 'pointer',
                                                    marginLeft: '4px'
                                                }}
                                            >{doc.annualRenewal ? 'ANNUAL' : 'ONE-TIME'}</span>
                                        </td>
                                        <td style={{ padding: '20px 16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteDocType(doc.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete document type"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
            </section>
            )}

            {/* Entity Document Types */}
            {effectiveSection === 'entityDocTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="var(--accent-primary)" /> Entity Document Types
                </h3>
                <form onSubmit={handleAddEntityDocType} style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    <div style={{ flex: '1 1 300px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Name</label>
                        <input type="text" value={newEdtName} onChange={e => setNewEdtName(e.target.value)} style={{ width: '100%', marginBottom: '12px' }} placeholder="e.g. Power of Attorney" />
                        <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description (optional)</label>
                        <textarea value={newEdtDescription} onChange={e => setNewEdtDescription(e.target.value)} style={{ width: '100%', minHeight: '50px', resize: 'vertical' }} placeholder="Brief description..." />
                    </div>
                    <div style={{ width: '1px' }}></div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', width: '100%', marginTop: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Scope:</span>
                            {(['company', 'person', 'both'] as const).map(s => (
                                <button key={s} type="button" onClick={() => setNewEdtScope(s)} style={{ padding: '3px 10px', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer', border: newEdtScope === s ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: newEdtScope === s ? 'rgba(0,170,200,0.08)' : 'transparent', color: newEdtScope === s ? 'var(--accent-primary)' : 'var(--text-secondary)', fontWeight: newEdtScope === s ? 600 : 400, textTransform: 'capitalize' }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                            <input type="checkbox" checked={newEdtRequired} onChange={e => setNewEdtRequired(e.target.checked)} style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }} />
                            Required
                        </label>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
                            <Plus size={18} /> Add Type
                        </button>
                    </div>
                </form>

                <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <caption className="sr-only">Entity document types configuration</caption>
                        <thead>
                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                <th scope="col" style={{ padding: '16px' }}>Document Type</th>
                                <th scope="col" style={{ padding: '16px' }}>Scope</th>
                                <th scope="col" style={{ padding: '16px' }}>Status</th>
                                <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entityDocTypes.map((edt, index) => (
                                <tr key={edt.id} draggable onDragStart={() => handleEdtDragStart(index)} onDragOver={(e) => handleEdtDragOver(e, index)} onDrop={(e) => handleEdtDrop(e, index)} onDragEnd={() => { dragEdtIndex.current = null; setDragOverEdtIndex(null) }} style={{ borderBottom: '1px solid var(--table-border)', opacity: dragEdtIndex.current === index ? 0.5 : 1, background: dragOverEdtIndex === index ? 'rgba(0, 210, 255, 0.1)' : 'transparent', cursor: 'grab' }}>
                                    <td style={{ padding: '20px 16px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <GripVertical size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '20px', textAlign: 'center' }}>{index + 1}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '20px 16px' }}>
                                        {editingEdtId === edt.id ? (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                <input type="text" value={editEdtName} onChange={e => setEditEdtName(e.target.value)} autoFocus style={{ width: '100%' }} />
                                                <textarea value={editEdtDescription} onChange={e => setEditEdtDescription(e.target.value)} placeholder="Description..." style={{ width: '100%', minHeight: '50px', borderRadius: '8px' }} />
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Scope:</span>
                                                    {(['company', 'person', 'both'] as const).map(s => (
                                                        <button key={s} type="button" onClick={() => setEditEdtScope(s)} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', cursor: 'pointer', border: editEdtScope === s ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: editEdtScope === s ? 'rgba(0,170,200,0.08)' : 'transparent', color: editEdtScope === s ? 'var(--accent-primary)' : 'var(--text-secondary)', textTransform: 'capitalize' }}>
                                                            {s}
                                                        </button>
                                                    ))}
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer', fontSize: '0.78rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                                                        <input type="checkbox" checked={editEdtRequired} onChange={e => setEditEdtRequired(e.target.checked)} style={{ width: '14px', height: '14px', accentColor: 'var(--accent-primary)' }} />
                                                        Required
                                                    </label>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button onClick={() => saveEdtEdit(edt.id)} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Save</button>
                                                    <button onClick={() => setEditingEdtId(null)} style={{ padding: '4px 12px', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{edt.name}</div>
                                                {edt.description && <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{edt.description}</div>}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ padding: '20px 16px' }}>
                                        <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: edt.entityScope === 'company' ? 'rgba(100,100,255,0.1)' : edt.entityScope === 'person' ? 'rgba(255,100,200,0.1)' : 'rgba(0,170,200,0.1)', color: edt.entityScope === 'company' ? '#6464ff' : edt.entityScope === 'person' ? '#ff64c8' : 'var(--accent-primary)', textTransform: 'capitalize' }}>
                                            {edt.entityScope}
                                        </span>
                                    </td>
                                    <td style={{ padding: '20px 16px' }}>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, background: edt.isRequired ? 'rgba(0,170,200,0.1)' : 'rgba(100,100,100,0.1)', color: edt.isRequired ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                                                {edt.isRequired ? 'REQUIRED' : 'OPTIONAL'}
                                            </span>
                                            <button onClick={() => handleEdtToggleActive(edt.id, edt.isActive)} style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', background: edt.isActive ? 'rgba(0,200,100,0.1)' : 'rgba(255,77,77,0.1)', color: edt.isActive ? '#00c864' : 'var(--danger)' }}>
                                                {edt.isActive ? 'ACTIVE' : 'INACTIVE'}
                                            </button>
                                        </div>
                                    </td>
                                    <td style={{ padding: '20px 16px', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => { setEditingEdtId(edt.id); setEditEdtName(edt.name); setEditEdtDescription(edt.description || ''); setEditEdtScope(edt.entityScope); setEditEdtRequired(edt.isRequired) }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }}><Edit3 size={18} /></button>
                                            <button onClick={() => handleDeleteEntityDocType(edt.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }}><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
            )}

            {/* 2. Assured Roles */}
            {effectiveSection === 'roles' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <UserCheck size={20} color="var(--accent-primary)" /> Assured Roles
                </h3>
                <form onSubmit={handleAddRole} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        value={newRole}
                        onChange={e => setNewRole(e.target.value)}
                        style={{ flex: 1 }}
                        placeholder="e.g. Technical Manager"
                        aria-label="Assured role name"
                    />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Add Role
                    </button>
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Assured roles</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                    <th scope="col" style={{ padding: '16px' }}>Role</th>
                                    <th scope="col" style={{ padding: '16px', width: '120px' }}>Vessels</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {roles.map((role, index) => (
                                    <tr
                                        key={role.id}
                                        draggable
                                        onDragStart={() => handleRoleDragStart(index)}
                                        onDragOver={(e) => handleRoleDragOver(e, index)}
                                        onDrop={(e) => handleRoleDrop(e, index)}
                                        onDragEnd={() => { dragRoleIndex.current = null; setDragOverRoleIndex(null) }}
                                        style={{
                                            borderBottom: '1px solid var(--table-border)',
                                            opacity: dragRoleIndex.current === index ? 0.5 : 1,
                                            background: dragOverRoleIndex === index ? 'rgba(0, 210, 255, 0.1)' : 'transparent',
                                            cursor: 'grab'
                                        }}
                                    >
                                        <td style={{ padding: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <GripVertical size={16} color="var(--text-secondary)" style={{ opacity: 0.5 }} />
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', minWidth: '20px', textAlign: 'center' }}>{index + 1}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            {editingRoleId === role.id ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input
                                                        type="text"
                                                        value={editRoleName}
                                                        onChange={e => setEditRoleName(e.target.value)}
                                                        onKeyDown={e => e.key === 'Enter' && saveRoleEdit(role.id)}
                                                        onKeyDownCapture={e => e.key === 'Escape' && setEditingRoleId(null)}
                                                        autoFocus
                                                        style={{ flex: 1 }}
                                                        aria-label="Edit role name"
                                                    />
                                                    <button onClick={() => saveRoleEdit(role.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                    <button onClick={() => setEditingRoleId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <span onClick={() => startEditingRole(role)} style={{ cursor: 'pointer' }}>{role.name}</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '16px' }}>
                                            <span
                                                onClick={() => handleShowRoleVessels(role)}
                                                style={{
                                                    fontSize: '0.85rem',
                                                    color: (role.vesselCount || 0) > 0 ? 'var(--accent-primary)' : 'var(--text-secondary)',
                                                    fontWeight: (role.vesselCount || 0) > 0 ? '600' : '400',
                                                    cursor: (role.vesselCount || 0) > 0 ? 'pointer' : 'default',
                                                    textDecoration: (role.vesselCount || 0) > 0 ? 'underline' : 'none'
                                                }}
                                            >
                                                {role.vesselCount || 0}
                                            </span>
                                        </td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteRole(role.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete role"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
            </section>
            )}

            {/* 3. Condition Survey Types */}
            {effectiveSection === 'surveyTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <ClipboardCheck size={20} color="var(--accent-primary)" /> Condition Survey Types
                </h3>
                <form onSubmit={handleAddSurveyType} style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
                    <input
                        type="text"
                        value={newSurveyType}
                        onChange={e => setNewSurveyType(e.target.value)}
                        style={{ flex: 1 }}
                        placeholder="e.g. Annual Condition Survey"
                        aria-label="Survey type name"
                    />
                    <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Plus size={18} /> Add Type
                    </button>
                </form>

                    <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <caption className="sr-only">Condition survey types</caption>
                            <thead>
                                <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                    <th scope="col" style={{ padding: '16px' }}>Survey Type</th>
                                    <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {surveyTypes.map(type => (
                                    <tr key={type.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                        <td style={{ padding: '16px' }}>{type.name}</td>
                                        <td style={{ padding: '16px', textAlign: 'right' }}>
                                            <button onClick={() => handleDeleteSurveyType(type.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete survey type"><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
            </section>
            )}

            {/* 4. Sanctions Check Scheduler */}
            {effectiveSection === 'compliance' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} color="var(--accent-primary)" /> Scheduled Compliance Check
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Automatically check all entities and vessels against sanctions lists on a weekly schedule.
                </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                            <div style={{ marginBottom: '20px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.enabled}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, enabled: e.target.checked })}
                                        style={{ width: '20px', height: '20px', accentColor: 'var(--accent-primary)' }}
                                        aria-label="Enable weekly compliance check"
                                    />
                                    <span style={{ fontWeight: '600' }}>Enable Weekly Compliance Check</span>
                                </label>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Day of Week</label>
                                    <select
                                        value={complianceSettings.dayOfWeek}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, dayOfWeek: parseInt(e.target.value) })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Day of week"
                                    >
                                        {dayNames.map((day, i) => (
                                            <option key={i} value={i}>{day}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Time</label>
                                    <input
                                        type="time"
                                        value={complianceSettings.timeOfDay}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, timeOfDay: e.target.value })}
                                        style={{ width: '100%', padding: '10px', borderRadius: '8px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Time of day"
                                    />
                                </div>
                            </div>

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                    Match Score Threshold: {complianceSettings.threshold}%
                                </label>
                                <input
                                    type="range"
                                    min="50"
                                    max="100"
                                    step="5"
                                    value={complianceSettings.threshold}
                                    onChange={e => setComplianceSettings({ ...complianceSettings, threshold: parseInt(e.target.value) })}
                                    style={{ width: '100%', accentColor: 'var(--accent-primary)' }}
                                    disabled={!complianceSettings.enabled}
                                    aria-label="Match score threshold"
                                />
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                    <span>50% (More matches)</span>
                                    <span>100% (Exact only)</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '12px' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.includeVessels}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, includeVessels: e.target.checked })}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                        aria-label="Include vessels in check"
                                    />
                                    <span>Include vessels in check</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.skipCleared}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, skipCleared: e.target.checked })}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                        disabled={!complianceSettings.enabled}
                                    />
                                    <span>Skip already cleared/confirmed entities</span>
                                </label>
                            </div>

                            <div style={{ marginBottom: '16px', padding: '12px', background: 'rgba(0, 210, 255, 0.05)', border: '1px solid rgba(0, 210, 255, 0.15)', borderRadius: '8px' }}>
                                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px', margin: '0 0 10px 0' }}>
                                    Manual pill check settings (applies to refresh buttons on sanctions badges):
                                </p>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={complianceSettings.autoMarkCleanOnCheck ?? true}
                                        onChange={e => setComplianceSettings({ ...complianceSettings, autoMarkCleanOnCheck: e.target.checked })}
                                        style={{ width: '18px', height: '18px', accentColor: 'var(--accent-primary)' }}
                                    />
                                    <span>Auto-mark as Clean when no matches above threshold</span>
                                </label>
                            </div>

                            {complianceSettings.lastRunAt && (
                                <div style={{ padding: '12px', background: 'rgba(0, 210, 255, 0.1)', border: '1px solid rgba(0, 210, 255, 0.2)', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem' }}>
                                    <div style={{ marginBottom: '4px' }}>
                                        <strong>Last run:</strong> {formatDateTime(complianceSettings.lastRunAt)}
                                    </div>
                                    {complianceSettings.nextRunAt && (
                                        <div>
                                            <strong>Next run:</strong> {formatDateTime(complianceSettings.nextRunAt)}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button
                                    onClick={handleSaveComplianceSettings}
                                    disabled={savingCompliance}
                                    className="btn-primary"
                                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {savingCompliance && <Loader2 size={16} className="spinner" />}
                                    Save Settings
                                </button>
                                <button
                                    onClick={handleRunManualCheck}
                                    disabled={runningManualCheck}
                                    className="btn-secondary"
                                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                                >
                                    {runningManualCheck ? <Loader2 size={16} className="spinner" /> : <Play size={16} />}
                                    Run Now
                                </button>
                            </div>
                            {runningManualCheck && checkProgress && checkProgress.total > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                                            Checking: {checkProgress.entityName}
                                        </span>
                                        <span>{checkProgress.current} / {checkProgress.total}</span>
                                    </div>
                                    <div style={{ height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{
                                            height: '100%',
                                            borderRadius: '3px',
                                            background: 'var(--accent-primary)',
                                            width: `${Math.round((checkProgress.current / checkProgress.total) * 100)}%`,
                                            transition: 'width 0.3s ease'
                                        }} />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <div style={{ marginTop: '20px', padding: '12px', background: 'rgba(0, 255, 136, 0.1)', border: '1px solid rgba(0, 255, 136, 0.2)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <strong>How it works:</strong> The system will check all entities{complianceSettings.includeVessels ? ' and vessels' : ''} against sanctions lists.
                        Matches above {complianceSettings.threshold}% confidence will be flagged as "Potential Match" for review.
                        Results can be viewed in the Compliance Center.
                    </div>
            </section>
            )}

            {/* 4. Vessel Reminder Settings */}
            {effectiveSection === 'reminders' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bell size={20} color="var(--accent-primary)" /> Vessel Reminder Settings
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Configure the snooze period and copy-to-clipboard template for document reminders.
                </p>

                    <div style={{ display: 'grid', gridTemplateColumns: '200px 200px 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div>
                            <label htmlFor="admin-reminder-period" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Snooze Period (days)</label>
                            <input
                                id="admin-reminder-period"
                                type="number"
                                min={1}
                                max={90}
                                value={reminderSettings.periodDays}
                                onChange={e => setReminderSettings({ ...reminderSettings, periodDays: Number(e.target.value) })}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <div>
                            <label htmlFor="admin-annual-grace" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Annual Doc Grace (days)</label>
                            <input
                                id="admin-annual-grace"
                                type="number"
                                min={30}
                                max={180}
                                value={annualGraceDays}
                                onChange={e => setAnnualGraceDays(Number(e.target.value) || 90)}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)' }}
                            />
                            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Annual docs received within this many days of P&I expiry are treated as compliant during the renewal window.
                            </p>
                        </div>
                        <div>
                            <label htmlFor="admin-reminder-template" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                Copy Template
                                <span style={{ marginLeft: '8px', fontSize: '0.8rem', opacity: 0.7 }}>
                                    Placeholders: {'{vesselName}'}, {'{imoNumber}'}, {'{vesselDocuments}'}, {'{assuredDocuments}'}
                                </span>
                            </label>
                            <textarea
                                id="admin-reminder-template"
                                value={reminderSettings.reminderTemplate}
                                onChange={e => setReminderSettings({ ...reminderSettings, reminderTemplate: e.target.value })}
                                rows={6}
                                style={{ width: '100%', padding: '10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSaveReminderSettings}
                            disabled={savingReminder}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {savingReminder && <Loader2 size={16} className="spinner" />}
                            Save Settings
                        </button>
                    </div>
            </section>
            )}

            {/* Report Settings */}
            {effectiveSection === 'reportSettings' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={20} color="var(--accent-primary)" /> Report Settings
                </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Configure branding settings applied to all generated PDF reports.
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Company Name</label>
                            <input
                                type="text"
                                value={reportSettings.companyName}
                                onChange={e => setReportSettings({ ...reportSettings, companyName: e.target.value })}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Company Subtitle <span style={{ fontWeight: '400', opacity: 0.6 }}>(optional)</span></label>
                            <input
                                type="text"
                                value={reportSettings.companySubtitle}
                                onChange={e => setReportSettings({ ...reportSettings, companySubtitle: e.target.value })}
                                placeholder="e.g. Marine Division"
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Footer Text</label>
                            <input
                                type="text"
                                value={reportSettings.footerText}
                                onChange={e => setReportSettings({ ...reportSettings, footerText: e.target.value })}
                                style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-secondary)', marginBottom: '6px' }}>Primary Color</label>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input
                                    type="color"
                                    value={rgbToHex(reportSettings.primaryColor)}
                                    onChange={e => setReportSettings({ ...reportSettings, primaryColor: hexToRgb(e.target.value) })}
                                    style={{ width: '44px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--input-border)', cursor: 'pointer', background: 'none' }}
                                />
                                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                                    {rgbToHex(reportSettings.primaryColor).toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', opacity: 0.6 }}>
                                    rgb({reportSettings.primaryColor.join(', ')})
                                </span>
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                            onClick={handleSaveReportSettings}
                            disabled={savingReportSettings}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            {savingReportSettings && <Loader2 size={16} className="spinner" />}
                            Save Settings
                        </button>
                    </div>
            </section>
            )}

            {/* Banks */}
            {effectiveSection === 'banks' && isAdmin && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Landmark size={20} color="var(--accent-primary)" /> Banks
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Manage bank accounts used for policy documents and quotation exports.
                </p>

                <form onSubmit={handleAddBank} style={{ marginBottom: '24px' }}>
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
                                            onKeyDown={e => e.key === 'Enter' && saveBankEdit(bank.id)}
                                            autoFocus
                                            style={{ width: '100%', marginBottom: '8px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', boxSizing: 'border-box' }}
                                            aria-label="Edit bank name"
                                        />
                                        <textarea
                                            value={editBankDetails}
                                            onChange={e => setEditBankDetails(e.target.value)}
                                            rows={3}
                                            style={{ width: '100%', marginBottom: '8px', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.9rem', resize: 'vertical', boxSizing: 'border-box' }}
                                        />
                                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                            <button onClick={() => saveBankEdit(bank.id)} className="btn-primary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Save</button>
                                            <button onClick={() => setEditingBankId(null)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: '0.82rem' }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '2px' }}>
                                            <button onClick={() => handleMoveBank(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                            <button onClick={() => handleMoveBank(index, 'down')} disabled={index === banks.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === banks.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === banks.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.92rem', marginBottom: '4px' }}>{bank.name}</div>
                                            {bank.details && (
                                                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.4, maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {bank.details}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                            <button onClick={() => startEditingBank(bank)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }} aria-label="Edit bank"><Edit3 size={16} /></button>
                                            <button onClick={() => handleDeleteBank(bank.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }} aria-label="Delete bank"><Trash2 size={16} /></button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {banks.length === 0 && (
                    <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        No banks configured yet. Add one above.
                    </div>
                )}
            </section>
            )}

            {/* 5. File Types */}
            {effectiveSection === 'fileTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} color="var(--accent-primary)" /> File Upload Security
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Control which file types users can upload for vessel documents and passport/ID files.
                </p>

                    {fileTypeStatus && (
                        <div style={{
                            padding: '12px 16px',
                            marginBottom: '16px',
                            background: fileTypeStatus.startsWith('✓') ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 77, 77, 0.1)',
                            border: fileTypeStatus.startsWith('✓') ? '1px solid rgba(0, 255, 136, 0.3)' : '1px solid rgba(255, 77, 77, 0.3)',
                            borderRadius: '8px',
                            fontSize: '0.9rem'
                        }}>
                            {fileTypeStatus}
                        </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                        <div>
                            <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--success)' }}>
                                Allowed File Types
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                Only these file types can be uploaded. Leave empty to allow all (except blocked).
                            </p>

                            <form onSubmit={handleAddAllowedExt} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input
                                    type="text"
                                    value={newAllowedExt}
                                    onChange={e => setNewAllowedExt(e.target.value)}
                                    placeholder=".pdf or pdf"
                                    style={{ flex: 1 }}
                                    aria-label="Allowed file extension"
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0 16px' }} aria-label="Add allowed extension">
                                    <Plus size={16} />
                                </button>
                            </form>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {fileTypeSettings.allowedExtensions.map(ext => (
                                    <div
                                        key={ext}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            background: 'rgba(0, 255, 136, 0.1)',
                                            border: '1px solid rgba(0, 255, 136, 0.3)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        <span>{ext}</span>
                                        <button
                                            onClick={() => handleRemoveAllowedExt(ext)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            aria-label={`Remove allowed extension ${ext}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {fileTypeSettings.allowedExtensions.length === 0 && (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                        All file types allowed (except blocked)
                                    </div>
                                )}
                            </div>
                        </div>

                        <div>
                            <h4 style={{ marginBottom: '12px', fontSize: '1rem', color: 'var(--danger)' }}>
                                Blocked File Types
                            </h4>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                                These file types are always rejected, even if in allowed list.
                            </p>

                            <form onSubmit={handleAddBlockedExt} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                <input
                                    type="text"
                                    value={newBlockedExt}
                                    onChange={e => setNewBlockedExt(e.target.value)}
                                    placeholder=".exe or exe"
                                    style={{ flex: 1 }}
                                    aria-label="Blocked file extension"
                                />
                                <button type="submit" className="btn-primary" style={{ padding: '0 16px', background: 'var(--danger)' }} aria-label="Add blocked extension">
                                    <Plus size={16} />
                                </button>
                            </form>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                {fileTypeSettings.blockedExtensions.map(ext => (
                                    <div
                                        key={ext}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            padding: '6px 12px',
                                            background: 'rgba(255, 77, 77, 0.1)',
                                            border: '1px solid rgba(255, 77, 77, 0.3)',
                                            borderRadius: '6px',
                                            fontSize: '0.85rem',
                                            fontFamily: 'monospace'
                                        }}
                                    >
                                        <span>{ext}</span>
                                        <button
                                            onClick={() => handleRemoveBlockedExt(ext)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-secondary)',
                                                cursor: 'pointer',
                                                padding: '0',
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                            aria-label={`Remove blocked extension ${ext}`}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                                {fileTypeSettings.blockedExtensions.length === 0 && (
                                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic' }}>
                                        No blocked file types
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
            </section>
            )}

            {/* Timezones */}
            {effectiveSection === 'policySettings' && isAdmin && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} color="var(--accent-primary)" /> Policy Settings
                </h3>

                {/* Font Size */}
                <div style={{ marginBottom: '24px' }}>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Export Font Size</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Font size for policy, debit advice, and credit advice documents (in points).
                    </p>
                    <PolicyFontSizeSetting />
                </div>

                <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

                {/* Timezones */}
                <div>
                    <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Timezones</h4>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                        Timezone options available when converting quotations to policies.
                    </p>
                    <TimezoneManager />
                </div>

                <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

                {/* Base Currency */}
                <BaseCurrencySetting />

                <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

                {/* Total Pages & Footer */}
                <PolicyExportSettings />
            </section>
            )}

            {/* Backup & Restore */}
            {effectiveSection === 'logRetention' && isAdmin && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={20} color="var(--accent-primary)" /> Activity Log Retention
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Automatically delete old activity log entries to keep the database lean. Cleanup runs on app startup and when saving.
                </p>

                <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} color="var(--accent-primary)" />
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Current entries: <strong style={{ color: 'var(--text-primary)' }}>{logEntryCount.toLocaleString()}</strong>
                    </span>
                </div>

                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)', marginBottom: '8px' }}>
                        Retention Period
                    </label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {[
                            { label: '90 days', value: 90 },
                            { label: '180 days', value: 180 },
                            { label: '365 days', value: 365 },
                            { label: 'Never', value: 0 },
                        ].map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => handleSaveRetention(opt.value)}
                                disabled={savingRetention}
                                className={logRetentionDays === opt.value ? 'btn-primary' : 'btn-secondary'}
                                style={{
                                    padding: '8px 20px',
                                    fontSize: '0.85rem',
                                    ...(logRetentionDays === opt.value ? {} : { opacity: 0.7 })
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <button
                    onClick={handleCleanNow}
                    disabled={cleaningLog || logRetentionDays === 0}
                    className="btn-secondary"
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px' }}
                >
                    {cleaningLog ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />}
                    {cleaningLog ? 'Cleaning...' : 'Clean Now'}
                </button>

                {logRetentionDays === 0 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: '12px', fontStyle: 'italic' }}>
                        Retention is set to &quot;Never&quot; — no automatic cleanup will occur.
                    </p>
                )}
            </section>
            )}

            {effectiveSection === 'backup' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Download size={20} color="var(--accent-primary)" /> Backup & Restore
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    Create a full database backup or restore from a previous backup file.
                    User accounts are preserved during backup and restore operations.
                </p>

                {lastBackupDate && (
                    <div style={{ marginBottom: '20px', padding: '12px 16px', background: 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.15)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={16} color="var(--accent-primary)" />
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Last backup: {formatDateTime(lastBackupDate)}
                        </span>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <button
                        onClick={handleBackup}
                        disabled={backupInProgress}
                        className="btn-primary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px' }}
                    >
                        {backupInProgress ? <Loader2 size={18} className="spin" /> : <Download size={18} />}
                        {backupInProgress ? 'Backing up...' : 'Backup Database'}
                    </button>
                    <button
                        onClick={() => setShowRestoreConfirm(true)}
                        disabled={restoreInProgress}
                        className="btn-secondary"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    >
                        {restoreInProgress ? <Loader2 size={18} className="spin" /> : <Upload size={18} />}
                        {restoreInProgress ? 'Restoring...' : 'Restore Database'}
                    </button>
                </div>

                <div style={{ padding: '12px', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid rgba(255, 165, 0, 0.3)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} color="rgb(255, 165, 0)" />
                    <span>Restoring a backup will replace all current data (except user accounts) with the backup contents. This action cannot be undone.</span>
                </div>

                {/* Restore confirmation modal */}
                {showRestoreConfirm && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }} onClick={() => setShowRestoreConfirm(false)}>
                        <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '28px', maxWidth: '440px', width: '90%', border: '1px solid var(--glass-border)' }} onClick={e => e.stopPropagation()}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                                <AlertTriangle size={24} color="var(--danger)" />
                                <h3 style={{ margin: 0 }}>Confirm Restore</h3>
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px' }}>
                                This will replace all current data with the backup contents. User accounts will not be affected.
                            </p>
                            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', fontWeight: '600', marginBottom: '24px' }}>
                                This action cannot be undone.
                            </p>
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                                <button onClick={() => setShowRestoreConfirm(false)} className="btn-secondary" style={{ padding: '8px 20px' }}>Cancel</button>
                                <button onClick={handleRestore} className="btn-primary" style={{ padding: '8px 20px', background: 'var(--danger)' }}>Restore</button>
                            </div>
                        </div>
                    </div>
                )}
            </section>
            )}

            {/* 6. Database Configuration */}
            {effectiveSection === 'dbConfig' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Database size={20} color="var(--accent-primary)" /> Database
                    </h3>
                    <button
                        className="btn-primary"
                        disabled={loadingDbHealth}
                        onClick={async () => {
                            setLoadingDbHealth(true)
                            try {
                                const result = await window.api.getDatabaseHealth()
                                setDbHealth(result)
                            } catch { showError('Failed to load database health') }
                            setLoadingDbHealth(false)
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }}
                    >
                        {loadingDbHealth ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
                        {dbHealth ? 'Refresh Health' : 'Check Health'}
                    </button>
                </div>

                {/* Health section */}
                {dbHealth && (
                    <>
                        {/* KPI cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
                            <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status</div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{
                                        width: '10px', height: '10px', borderRadius: '50%',
                                        background: dbHealth.connected ? '#22c55e' : 'var(--danger)',
                                        boxShadow: dbHealth.connected ? '0 0 6px #22c55e' : '0 0 6px var(--danger)'
                                    }} />
                                    <span style={{ fontWeight: 600, fontSize: '1rem', color: dbHealth.connected ? '#22c55e' : 'var(--danger)' }}>
                                        {dbHealth.connected ? 'Connected' : 'Disconnected'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Version</div>
                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{dbHealth.version || 'N/A'}</div>
                            </div>
                            <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Database Size</div>
                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{dbHealth.databaseSize}</div>
                            </div>
                            <div style={{ padding: '16px', background: 'var(--bg-card)', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Tables</div>
                                <div style={{ fontWeight: 600, fontSize: '1rem' }}>{dbHealth.tableCount}</div>
                            </div>
                        </div>

                        {/* Largest tables */}
                        {dbHealth.largestTables.length > 0 && (
                            <div>
                                <h4 style={{ marginBottom: '12px', fontSize: '0.92rem', color: 'var(--text-primary)' }}>Top 10 Largest Tables</h4>
                                <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <caption className="sr-only">Largest database tables</caption>
                                        <thead>
                                            <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                                <th scope="col" style={{ padding: '12px 16px' }}>#</th>
                                                <th scope="col" style={{ padding: '12px 16px' }}>Table</th>
                                                <th scope="col" style={{ padding: '12px 16px', textAlign: 'right' }}>Rows</th>
                                                <th scope="col" style={{ padding: '12px 16px', textAlign: 'right' }}>Size (MB)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {dbHealth.largestTables.map((t, i) => (
                                                <tr key={t.name} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                                    <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{i + 1}</td>
                                                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: '0.85rem' }}>{t.name}</td>
                                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.85rem' }}>{t.rows.toLocaleString()}</td>
                                                    <td style={{ padding: '10px 16px', textAlign: 'right', fontSize: '0.85rem' }}>{t.sizeMB.toFixed(2)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* Last backup */}
                        <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(0,210,255,0.06)', border: '1px solid rgba(0,210,255,0.15)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            Last backup: {dbHealth.lastBackup || 'No backup recorded'}
                        </div>
                    </>
                )}

                {!dbHealth && !loadingDbHealth && (
                    <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                        Click &quot;Check Health&quot; to view database statistics.
                    </div>
                )}

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--glass-border)', margin: '24px 0' }} />

                {/* Connection configuration */}
                <h4 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.95rem' }}>
                    Connection Configuration
                </h4>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                    View and manage the MySQL database connection settings.
                </p>

                    <div style={{ marginBottom: '24px' }}>
                        <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Current Configuration File</div>
                        <div className="px-4 py-3 bg-black/20 rounded-lg text-sm text-gray-300 font-mono border border-white/5 break-all">
                            {configPath || 'Not configured'}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <button
                            onClick={handleBrowseConfigFile}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                        >
                            <Database size={18} />
                            Browse for Config File
                        </button>
                        <button
                            onClick={handleBrowseConfigDir}
                            className="btn-primary"
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'rgba(100, 100, 255, 0.2)' }}
                        >
                            <Database size={18} />
                            Load from Directory
                        </button>
                    </div>

                    <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255, 165, 0, 0.1)', border: '1px solid rgba(255, 165, 0, 0.3)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Changing database configuration will reload the application. Make sure all work is saved.
                    </div>
            </section>
            )}

            {/* 7. Vessel Types */}
            {effectiveSection === 'vesselTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Ship size={20} color="var(--accent-primary)" /> Vessel Types
                </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Manage vessel types (e.g. Bulk Carrier, Container Ship, Tanker).
                    </p>
                    <form onSubmit={handleAddVesselType} style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <input type="text" value={newVesselTypeName} onChange={e => setNewVesselTypeName(e.target.value)} placeholder="Short name (e.g. BC)" style={{ width: '140px' }} aria-label="Vessel type name" />
                        <input type="text" value={newVesselTypeDescription} onChange={e => setNewVesselTypeDescription(e.target.value)} placeholder="Full name (e.g. Bulk Carrier)" style={{ flex: 1, minWidth: '200px' }} aria-label="Vessel type description" />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add
                        </button>
                    </form>
                    {vesselTypes.length > 0 && (
                        <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Vessel types</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                        <th scope="col" style={{ padding: '16px', width: '120px' }}>Name</th>
                                        <th scope="col" style={{ padding: '16px' }}>Full Name / Description</th>
                                        <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {vesselTypes.map((vt, index) => (
                                        <tr key={vt.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button onClick={() => handleMoveVesselType(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                                        <button onClick={() => handleMoveVesselType(index, 'down')} disabled={index === vesselTypes.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === vesselTypes.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === vesselTypes.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                                    </div>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{index + 1}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px', fontFamily: 'monospace', fontWeight: '600', fontSize: '0.9rem' }}>
                                                {editingVesselTypeId === vt.id ? (
                                                    <input type="text" value={editVesselTypeName} onChange={e => setEditVesselTypeName(e.target.value)} autoFocus style={{ width: '100px' }} />
                                                ) : vt.name}
                                            </td>
                                            <td style={{ padding: '16px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                                                {editingVesselTypeId === vt.id ? (
                                                    <input type="text" value={editVesselTypeDescription} onChange={e => setEditVesselTypeDescription(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveVesselTypeEdit(vt.id)} placeholder="Full name" style={{ width: '100%' }} />
                                                ) : (vt.description || <span style={{ opacity: 0.4, fontStyle: 'italic' }}>—</span>)}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    {editingVesselTypeId === vt.id ? (
                                                        <>
                                                            <button onClick={() => saveVesselTypeEdit(vt.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                            <button onClick={() => setEditingVesselTypeId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => { setEditingVesselTypeId(vt.id); setEditVesselTypeName(vt.name); setEditVesselTypeDescription(vt.description || '') }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={18} /></button>
                                                            <button onClick={() => handleDeleteVesselType(vt.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </section>
            )}

            {/* 8. Classification Societies */}
            {effectiveSection === 'classSocieties' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={20} color="var(--accent-primary)" /> Classification Societies
                </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Manage classification societies. Vessels can be assigned to one or more classes.
                    </p>
                    <form onSubmit={handleAddClassSociety} style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <input type="text" value={newClassName} onChange={e => setNewClassName(e.target.value)} placeholder="Name (e.g. Lloyd's Register)" style={{ flex: 2, minWidth: '150px' }} aria-label="Class name" />
                        <input type="text" value={newClassAbbr} onChange={e => setNewClassAbbr(e.target.value)} placeholder="Abbreviation (e.g. LR)" style={{ flex: 1, minWidth: '80px' }} aria-label="Abbreviation" />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            <input type="checkbox" checked={newClassIacs} onChange={e => setNewClassIacs(e.target.checked)} /> IACS
                        </label>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add
                        </button>
                    </form>
                    {classSocieties.length > 0 && (
                        <div style={{ overflow: 'hidden', borderRadius: '8px', border: '1px solid var(--table-border)' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <caption className="sr-only">Classification societies</caption>
                                <thead>
                                    <tr style={{ textAlign: 'left', background: 'var(--table-header-bg)', borderBottom: '1px solid var(--table-border)' }}>
                                        <th scope="col" style={{ padding: '16px', width: '60px' }}>#</th>
                                        <th scope="col" style={{ padding: '16px' }}>Name</th>
                                        <th scope="col" style={{ padding: '16px' }}>Abbreviation</th>
                                        <th scope="col" style={{ padding: '16px' }}>IACS</th>
                                        <th scope="col" style={{ padding: '16px', textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {classSocieties.map((cs, index) => (
                                        <tr key={cs.id} style={{ borderBottom: '1px solid var(--table-border)' }}>
                                            <td style={{ padding: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                        <button onClick={() => handleMoveClassSociety(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                                        <button onClick={() => handleMoveClassSociety(index, 'down')} disabled={index === classSocieties.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === classSocieties.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === classSocieties.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                                    </div>
                                                    <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{index + 1}</span>
                                                </div>
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="text" value={editClassName} onChange={e => setEditClassName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveClassSocietyEdit(cs.id)} autoFocus style={{ width: '100%' }} />
                                                ) : cs.name}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="text" value={editClassAbbr} onChange={e => setEditClassAbbr(e.target.value)} style={{ width: '80px' }} />
                                                ) : cs.abbreviation}
                                            </td>
                                            <td style={{ padding: '16px' }}>
                                                {editingClassId === cs.id ? (
                                                    <input type="checkbox" checked={editClassIacs} onChange={e => setEditClassIacs(e.target.checked)} />
                                                ) : cs.isIacs ? 'Yes' : 'No'}
                                            </td>
                                            <td style={{ padding: '16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                                    {editingClassId === cs.id ? (
                                                        <>
                                                            <button onClick={() => saveClassSocietyEdit(cs.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                            <button onClick={() => setEditingClassId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <button onClick={() => { setEditingClassId(cs.id); setEditClassName(cs.name); setEditClassAbbr(cs.abbreviation); setEditClassIacs(cs.isIacs) }} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={18} /></button>
                                                            <button onClick={() => handleDeleteClassSociety(cs.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={18} /></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
            </section>
            )}

            {/* 8. Policy Types */}
            {effectiveSection === 'policyTypes' && (
            <section className="glass-card" style={{ padding: '24px', marginBottom: '32px' }}>
                <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Tag size={20} color="var(--accent-primary)" /> Policy Types
                </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                        Define policy types that can be assigned to vessels. Used by the Dynamic Address Book for building distribution lists.
                    </p>
                    <form onSubmit={handleAddPolicyType} style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
                        <input
                            type="text"
                            value={newPolicyTypeCode}
                            onChange={e => setNewPolicyTypeCode(e.target.value.toUpperCase())}
                            style={{ width: '60px', textAlign: 'center', fontWeight: 700 }}
                            placeholder="Code"
                            maxLength={5}
                            aria-label="Policy type code"
                        />
                        <input
                            type="text"
                            value={newPolicyType}
                            onChange={e => setNewPolicyType(e.target.value)}
                            style={{ flex: 1 }}
                            placeholder="e.g. Hull & Machinery"
                            aria-label="Policy type name"
                        />
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add Policy Type
                        </button>
                    </form>

                    {policyTypes.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {policyTypes.map((pt, index) => (
                                <div key={pt.id} style={{ border: '1px solid var(--table-border)', borderRadius: '8px', overflow: 'hidden' }}>
                                    {/* Policy type header row */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: expandedPolicyTypeId === pt.id ? 'var(--table-header-bg)' : 'transparent' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            <button onClick={() => handleMovePolicyType(index, 'up')} disabled={index === 0} style={{ background: 'transparent', border: 'none', cursor: index === 0 ? 'default' : 'pointer', padding: '0', opacity: index === 0 ? 0.3 : 1 }} aria-label="Move up"><ChevronUp size={14} color="var(--text-secondary)" /></button>
                                            <button onClick={() => handleMovePolicyType(index, 'down')} disabled={index === policyTypes.length - 1} style={{ background: 'transparent', border: 'none', cursor: index === policyTypes.length - 1 ? 'default' : 'pointer', padding: '0', opacity: index === policyTypes.length - 1 ? 0.3 : 1 }} aria-label="Move down"><ChevronDown size={14} color="var(--text-secondary)" /></button>
                                        </div>
                                        <button onClick={() => toggleExpandPolicyType(pt.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0' }}>
                                            {expandedPolicyTypeId === pt.id ? <ChevronDown size={16} color="var(--accent-primary)" /> : <ChevronRight size={16} color="var(--text-secondary)" />}
                                        </button>
                                        <div style={{ flex: 1 }}>
                                            {editingPolicyTypeId === pt.id ? (
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input type="text" value={editPolicyTypeCode} onChange={e => setEditPolicyTypeCode(e.target.value)} placeholder="Code" style={{ width: '50px', textAlign: 'center', fontWeight: 700 }} aria-label="Policy type code" />
                                                    <input type="text" value={editPolicyTypeName} onChange={e => setEditPolicyTypeName(e.target.value)} onKeyDown={e => e.key === 'Enter' && savePolicyTypeEdit(pt.id)} autoFocus style={{ flex: 1 }} aria-label="Edit policy type name" />
                                                    <button onClick={() => savePolicyTypeEdit(pt.id)} className="btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Save</button>
                                                    <button onClick={() => setEditingPolicyTypeId(null)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }}>Cancel</button>
                                                </div>
                                            ) : (
                                                <span onClick={() => toggleExpandPolicyType(pt.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    {pt.code && <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: 'rgba(0,170,200,0.12)', color: 'var(--accent-primary)' }}>{pt.code}</span>}
                                                    <span style={{ fontWeight: '600' }}>{pt.name}</span>
                                                </span>
                                            )}
                                        </div>
                                        {expandedPolicyTypeId !== pt.id && (
                                            <span onClick={() => toggleExpandPolicyType(pt.id)} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', opacity: 0.7 }}>Click to configure fields &amp; conditions</span>
                                        )}
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button onClick={() => startEditingPolicyType(pt)} style={{ background: 'transparent', color: 'var(--accent-primary)', border: 'none', cursor: 'pointer' }} aria-label="Edit"><Edit3 size={16} /></button>
                                            <button onClick={() => handleDeletePolicyType(pt.id)} style={{ background: 'transparent', color: 'var(--danger)', border: 'none', cursor: 'pointer' }} aria-label="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    </div>

                                    {/* Expanded: Characteristics + Conditions */}
                                    {expandedPolicyTypeId === pt.id && (
                                        <div style={{ padding: '16px', borderTop: '1px solid var(--table-border)', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                            {/* Characteristics */}
                                            <div style={{ flex: 2, minWidth: '300px' }}>
                                                <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Characteristics (Fields)</h4>
                                                <form onSubmit={handleAddCharacteristic} style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                                    <input type="text" value={newCharName} onChange={e => setNewCharName(e.target.value)} placeholder="Field name" style={{ flex: 2, minWidth: '120px', fontSize: '0.85rem', padding: '4px 8px' }} />
                                                    <select value={newCharType} onChange={e => setNewCharType(e.target.value as any)} style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', background: 'var(--input-bg)', color: 'var(--text-primary)', border: '1px solid var(--input-border)' }}>
                                                        <option value="text">Text</option>
                                                        <option value="date">Date</option>
                                                        <option value="amount">Amount</option>
                                                        <option value="boolean">Boolean</option>
                                                        <option value="select">Select</option>
                                                    </select>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                                        <input type="checkbox" checked={newCharRequired} onChange={e => setNewCharRequired(e.target.checked)} /> Req
                                                    </label>
                                                    <button type="submit" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
                                                </form>
                                                {ptCharacteristics.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {ptCharacteristics.map(c => (
                                                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(128,128,128,0.05)', border: '1px solid var(--table-border)' }}>
                                                                <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                                                                <span style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(0,210,255,0.1)', color: 'var(--accent-primary)' }}>{c.fieldType}</span>
                                                                {c.isRequired && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>req</span>}
                                                                <button onClick={() => handleDeleteCharacteristic(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={14} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No characteristics defined</p>
                                                )}
                                            </div>

                                            {/* Conditions */}
                                            <div style={{ flex: 1, minWidth: '200px' }}>
                                                <h4 style={{ fontSize: '0.9rem', marginBottom: '12px', color: 'var(--text-secondary)' }}>Conditions</h4>
                                                <form onSubmit={handleAddCondition} style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                                    <input type="text" value={newCondName} onChange={e => setNewCondName(e.target.value)} placeholder="Condition name" style={{ flex: 1, fontSize: '0.85rem', padding: '4px 8px' }} />
                                                    <button type="submit" className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
                                                </form>
                                                {ptConditions.length > 0 ? (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {ptConditions.map(c => (
                                                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: '4px', background: 'rgba(128,128,128,0.05)', border: '1px solid var(--table-border)' }}>
                                                                <span style={{ flex: 1, fontSize: '0.85rem' }}>{c.name}</span>
                                                                <button onClick={() => handleDeleteCondition(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '0' }}><X size={14} /></button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>No conditions defined</p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
            </section>
            )}

            {/* User Groups - admin only */}
            {effectiveSection === 'userGroups' && isAdmin && (
                <section className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={20} color="var(--accent-primary)" /> User Groups
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Manage permission groups. Assign users to groups in the User Management page.
                    </p>

                    {/* Add Group Form */}
                    <form onSubmit={handleAddGroup} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Group Name</label>
                            <input
                                type="text"
                                value={newGroupName}
                                onChange={e => setNewGroupName(e.target.value)}
                                placeholder="e.g. Underwriters"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: '2 1 300px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description (optional)</label>
                            <input
                                type="text"
                                value={newGroupDescription}
                                onChange={e => setNewGroupDescription(e.target.value)}
                                placeholder="Brief description of the group"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <button type="submit" className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Plus size={18} /> Add Group
                        </button>
                    </form>

                    {/* Groups List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {userGroups.map(group => {
                            const isSelected = selectedGroupId === group.id
                            const isAdminGroup = group.isSystem && group.name.toLowerCase() === 'administrator'
                            return (
                                <div key={group.id} style={{ borderRadius: '10px', border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)', background: isSelected ? 'rgba(var(--accent-primary-rgb,0,210,255),0.04)' : 'transparent', overflow: 'hidden' }}>
                                    {/* Group Header Row */}
                                    <div
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', cursor: 'pointer' }}
                                        onClick={() => {
                                            if (editingGroupId !== group.id) handleSelectGroup(group.id)
                                        }}
                                    >
                                        {isSelected ? <ChevronDown size={16} color="var(--accent-primary)" /> : <ChevronRight size={16} color="var(--text-secondary)" />}
                                        {editingGroupId === group.id ? (
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flex: 1 }} onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="text"
                                                    value={editGroupName}
                                                    onChange={e => setEditGroupName(e.target.value)}
                                                    autoFocus
                                                    style={{ flex: 1, fontSize: '0.9rem' }}
                                                />
                                                <input
                                                    type="text"
                                                    value={editGroupDescription}
                                                    onChange={e => setEditGroupDescription(e.target.value)}
                                                    placeholder="Description"
                                                    style={{ flex: 2, fontSize: '0.9rem' }}
                                                />
                                                <button onClick={() => saveGroupEdit(group.id)} className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Save</button>
                                                <button onClick={() => setEditingGroupId(null)} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Cancel</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{group.name}</span>
                                                    {group.description && <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginLeft: '12px' }}>{group.description}</span>}
                                                </div>
                                                {group.isSystem && (
                                                    <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.5px', background: 'rgba(147,51,234,0.1)', color: '#d8b4fe', border: '1px solid rgba(147,51,234,0.2)' }}>
                                                        SYSTEM
                                                    </span>
                                                )}
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                    {!group.isSystem && (
                                                        <>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); startEditingGroup(group) }}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}
                                                                title="Edit group"
                                                            >
                                                                <Edit3 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={e => { e.stopPropagation(); handleDeleteGroup(group.id) }}
                                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}
                                                                title="Delete group"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Permission Editor (expanded) */}
                                    {isSelected && (
                                        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--table-border)' }}>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '12px 0 16px', fontStyle: isAdminGroup ? 'italic' : 'normal' }}>
                                                {isAdminGroup
                                                    ? 'System administrator group — all permissions are granted and cannot be changed.'
                                                    : 'Toggle permissions for this group. Changes are saved automatically.'}
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                {PERMISSION_CATEGORIES.map(cat => {
                                                    const collapsed = collapsedPermCategories.has(cat.key)
                                                    const allChecked = cat.permissions.every(p => isAdminGroup || groupPermissions.includes(p.key))
                                                    const someChecked = cat.permissions.some(p => isAdminGroup || groupPermissions.includes(p.key))
                                                    return (
                                                        <div key={cat.key} style={{ borderRadius: '8px', border: '1px solid var(--table-border)', overflow: 'hidden' }}>
                                                            {/* Category Header */}
                                                            <div
                                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px', background: 'var(--table-header-bg)', cursor: 'pointer' }}
                                                                onClick={() => togglePermCategory(cat.key)}
                                                            >
                                                                {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                                                                <input
                                                                    type="checkbox"
                                                                    checked={allChecked}
                                                                    ref={el => { if (el) el.indeterminate = someChecked && !allChecked }}
                                                                    onChange={e => { e.stopPropagation(); if (!isAdminGroup) handleToggleCategoryAll(group.id, cat.permissions) }}
                                                                    disabled={isAdminGroup}
                                                                    style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                                                                    onClick={e => e.stopPropagation()}
                                                                />
                                                                <span style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                                                                    {cat.label}
                                                                </span>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginLeft: 'auto' }}>
                                                                    {cat.permissions.filter(p => isAdminGroup || groupPermissions.includes(p.key)).length}/{cat.permissions.length}
                                                                </span>
                                                            </div>
                                                            {/* Permissions */}
                                                            {!collapsed && (
                                                                <div style={{ padding: '8px 12px 8px 40px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                    {cat.permissions.map(perm => (
                                                                        <label key={perm.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0', cursor: isAdminGroup ? 'default' : 'pointer' }}>
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isAdminGroup || groupPermissions.includes(perm.key)}
                                                                                onChange={() => { if (!isAdminGroup) handleToggleGroupPermission(group.id, perm.key) }}
                                                                                disabled={isAdminGroup}
                                                                                style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                                                                            />
                                                                            <span style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{perm.label}</span>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        })}

                        {userGroups.length === 0 && (
                            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                No groups defined yet. Create one above.
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Notification Groups - admin only */}
            {effectiveSection === 'notifGroups' && isAdmin && (
                <section className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bell size={20} color="var(--accent-primary)" /> Notification Groups
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Route notifications to specific users by creating groups and subscribing them to event types.
                    </p>

                    {/* Add Group Form */}
                    <form onSubmit={handleAddNotifGroup} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'flex-end' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Group Name</label>
                            <input
                                type="text"
                                value={newNotifGroupName}
                                onChange={e => setNewNotifGroupName(e.target.value)}
                                placeholder="e.g. Compliance Team"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div style={{ flex: '2 1 300px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Description</label>
                            <input
                                type="text"
                                value={newNotifGroupDesc}
                                onChange={e => setNewNotifGroupDesc(e.target.value)}
                                placeholder="Optional description"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <button type="submit" className="btn-primary" disabled={!newNotifGroupName.trim()} style={{ padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Plus size={14} /> Add Group
                        </button>
                    </form>

                    <div style={{ display: 'flex', gap: '20px', minHeight: '300px' }}>
                        {/* Groups list */}
                        <div style={{ flex: '0 0 320px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {notifGroups.map((g, idx) => (
                                <div
                                    key={g.id}
                                    onClick={() => handleSelectNotifGroup(g.id)}
                                    style={{
                                        padding: '12px 14px', borderRadius: '8px', cursor: 'pointer',
                                        border: selectedNotifGroupId === g.id ? '1px solid var(--accent-primary)' : '1px solid var(--table-border)',
                                        background: selectedNotifGroupId === g.id ? 'rgba(0,210,255,0.06)' : 'transparent',
                                    }}
                                >
                                    {editingNotifGroupId === g.id ? (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                                            <input value={editNotifGroupName} onChange={e => setEditNotifGroupName(e.target.value)} style={{ fontSize: '0.85rem' }} autoFocus />
                                            <input value={editNotifGroupDesc} onChange={e => setEditNotifGroupDesc(e.target.value)} placeholder="Description" style={{ fontSize: '0.8rem' }} />
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <button className="btn-primary" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => handleUpdateNotifGroup(g.id)}>Save</button>
                                                <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.75rem' }} onClick={() => setEditingNotifGroupId(null)}>Cancel</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                <button onClick={e => { e.stopPropagation(); handleReorderNotifGroup(idx, -1) }} disabled={idx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', opacity: idx === 0 ? 0.3 : 1 }}><ChevronUp size={12} /></button>
                                                <button onClick={e => { e.stopPropagation(); handleReorderNotifGroup(idx, 1) }} disabled={idx === notifGroups.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-secondary)', opacity: idx === notifGroups.length - 1 ? 0.3 : 1 }}><ChevronDown size={12} /></button>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{g.name}</div>
                                                {g.description && <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>{g.description}</div>}
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '4px', display: 'flex', gap: '12px' }}>
                                                    <span>{g.memberCount ?? 0} member{(g.memberCount ?? 0) !== 1 ? 's' : ''}</span>
                                                    <span>{g.subscriptionCount ?? 0} subscription{(g.subscriptionCount ?? 0) !== 1 ? 's' : ''}</span>
                                                </div>
                                            </div>
                                            <button onClick={e => { e.stopPropagation(); setEditingNotifGroupId(g.id); setEditNotifGroupName(g.name); setEditNotifGroupDesc(g.description || '') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}><Edit3 size={14} /></button>
                                            <button onClick={e => { e.stopPropagation(); handleDeleteNotifGroup(g.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: '4px' }}><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {notifGroups.length === 0 && (
                                <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                                    No notification groups yet.
                                </div>
                            )}
                        </div>

                        {/* Detail panel */}
                        {selectedNotifGroupId && (
                            <div style={{ flex: 1, border: '1px solid var(--table-border)', borderRadius: '10px', padding: '16px', maxHeight: 'calc(100vh - 400px)', overflowY: 'auto' }}>
                                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                    <button
                                        className={notifGroupTab === 'members' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '6px 16px', fontSize: '0.82rem' }}
                                        onClick={() => setNotifGroupTab('members')}
                                    >
                                        <Users size={14} style={{ marginRight: '6px' }} /> Members
                                    </button>
                                    <button
                                        className={notifGroupTab === 'subscriptions' ? 'btn-primary' : 'btn-secondary'}
                                        style={{ padding: '6px 16px', fontSize: '0.82rem' }}
                                        onClick={() => setNotifGroupTab('subscriptions')}
                                    >
                                        <Bell size={14} style={{ marginRight: '6px' }} /> Subscriptions
                                    </button>
                                </div>

                                {notifGroupTab === 'members' && (
                                    <div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                            Check users to include them in this notification group.
                                        </p>
                                        {allUsers.map(u => (
                                            <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={notifGroupMembers.includes(u.id)}
                                                    onChange={() => handleToggleNotifMember(u.id)}
                                                    style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                                                />
                                                <span style={{ fontSize: '0.9rem' }}>{u.username}</span>
                                            </label>
                                        ))}
                                        {allUsers.length === 0 && (
                                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No users found.</p>
                                        )}
                                    </div>
                                )}

                                {notifGroupTab === 'subscriptions' && (
                                    <div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                                            Select which events this group should be notified about.
                                        </p>
                                        {(() => {
                                            const categories = [...new Set(NOTIFICATION_EVENT_TYPES.map(e => e.category))]
                                            return categories.map(cat => (
                                                <div key={cat} style={{ marginBottom: '16px' }}>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                                                        {cat}
                                                    </div>
                                                    {NOTIFICATION_EVENT_TYPES.filter(e => e.category === cat).map(evt => (
                                                        <label key={evt.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={notifGroupSubs.includes(evt.key)}
                                                                onChange={() => handleToggleNotifSub(evt.key)}
                                                                style={{ accentColor: 'var(--accent-primary)', width: '14px', height: '14px' }}
                                                            />
                                                            <span style={{ fontSize: '0.88rem' }}>{evt.label}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            ))
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Daily Alerts - admin only */}
            {effectiveSection === 'dailyAlerts' && isAdmin && (
                <section className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
                    <h3 style={{ marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Clock size={20} color="var(--accent-primary)" /> Daily Alerts
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '24px' }}>
                        Automatically check for expiring documents, policies, blue cards, and warranty deadlines daily and notify subscribed groups.
                    </p>

                    {/* Enable / Disable */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={dailyAlertsEnabled}
                                onChange={async (e) => {
                                    const val = e.target.checked
                                    setDailyAlertsEnabled(val)
                                    await saveDailyAlertSetting('daily_alerts_enabled', String(val))
                                    showSuccess(val ? 'Daily alerts enabled' : 'Daily alerts disabled')
                                }}
                                style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                            />
                            <span style={{ fontWeight: 600 }}>Enable daily alerts</span>
                        </label>
                    </div>

                    {/* Time picker */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Run Time</label>
                            <input
                                type="time"
                                value={dailyAlertsTime}
                                onChange={async (e) => {
                                    setDailyAlertsTime(e.target.value)
                                    await saveDailyAlertSetting('daily_alerts_time', e.target.value)
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Threshold inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Document expiry (days)</label>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={dailyAlertsDocDays}
                                onChange={async (e) => {
                                    const v = parseInt(e.target.value, 10) || 30
                                    setDailyAlertsDocDays(v)
                                    await saveDailyAlertSetting('daily_alerts_doc_expiry_days', String(v))
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Policy expiry (days)</label>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={dailyAlertsPolicyDays}
                                onChange={async (e) => {
                                    const v = parseInt(e.target.value, 10) || 60
                                    setDailyAlertsPolicyDays(v)
                                    await saveDailyAlertSetting('daily_alerts_policy_expiry_days', String(v))
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Blue card expiry (days)</label>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={dailyAlertsBlueCardDays}
                                onChange={async (e) => {
                                    const v = parseInt(e.target.value, 10) || 30
                                    setDailyAlertsBlueCardDays(v)
                                    await saveDailyAlertSetting('daily_alerts_blue_card_days', String(v))
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Warranty deadline (days)</label>
                            <input
                                type="number"
                                min={1}
                                max={365}
                                value={dailyAlertsWarrantyDays}
                                onChange={async (e) => {
                                    const v = parseInt(e.target.value, 10) || 14
                                    setDailyAlertsWarrantyDays(v)
                                    await saveDailyAlertSetting('daily_alerts_warranty_days', String(v))
                                }}
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Run Now + Last Run */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button
                            className="btn-primary"
                            onClick={handleDailyAlertsRunNow}
                            disabled={dailyAlertsRunning}
                            style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        >
                            {dailyAlertsRunning ? <Loader2 size={14} className="spin" /> : <Play size={14} />}
                            {dailyAlertsRunning ? 'Running...' : 'Run Now'}
                        </button>
                        {dailyAlertsLastRun && (
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                Last run: {dailyAlertsLastRun}
                            </span>
                        )}
                    </div>
                </section>
            )}
            </fieldset>


        </div>
    </div>
)
}

// ==================== Timezone Manager ====================
function TimezoneManager() {
    const [timezones, setTimezones] = useState<string[]>([])
    const [newTz, setNewTz] = useState('')
    const [loading, setLoading] = useState(true)
    const { showSuccess } = useToast()

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

// ==================== Policy Font Size Setting ====================
function BaseCurrencySetting() {
    const [currency, setCurrency] = useState('USD')
    const [loading, setLoading] = useState(true)
    const { showSuccess } = useToast()

    useEffect(() => {
        (async () => {
            try {
                const raw = await window.api.getSetting('base_currency')
                if (raw) setCurrency(raw)
            } catch { /* default */ }
            finally { setLoading(false) }
        })()
    }, [])

    const handleSave = async () => {
        await window.api.setSetting('base_currency', currency.toUpperCase().trim())
        showSuccess(`Base currency set to ${currency.toUpperCase().trim()}`)
    }

    if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

    return (
        <div>
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Base Currency</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                The default accounting currency. Used for exchange rate calculations on policies.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                    type="text"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    maxLength={5}
                    style={{ width: '100px', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', fontSize: '0.88rem', textTransform: 'uppercase' }}
                />
                <button onClick={handleSave} className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.84rem' }}>Save</button>
            </div>
        </div>
    )
}

function PolicyFontSizeSetting() {
    const [fontSize, setFontSize] = useState(10)
    const [loading, setLoading] = useState(true)
    const { showSuccess } = useToast()

    useEffect(() => {
        (async () => {
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
    )
}

function PolicyExportSettings() {
    const defaultTitles: Record<string, string> = { P: 'Protection and Indemnity Certificate', H: 'Hull & Machinery Certificate', W: 'War Risk Certificate' }
    const defaultPageMap: Record<string, Record<string, number>> = { P: { '3': 30, '4': 31, '5': 32, '6': 33 }, H: { '3': 28, '4': 29, '5': 30 }, W: { '3': 25, '4': 26 } }

    const [headerTitles, setHeaderTitles] = useState(defaultTitles)
    const [pageCountMap, setPageCountMap] = useState(defaultPageMap)
    const [footerText, setFooterText] = useState('')
    const [premiumIntroText, setPremiumIntroText] = useState('Premium {currency} {amount} shall be payable in {instalments} Instalments on the following dates, at {time} {timezone}, time being of the essence:')
    const [loading, setLoading] = useState(true)
    const [newPageType, setNewPageType] = useState('P')
    const [newPageCount, setNewPageCount] = useState('')
    const [newTotalPages, setNewTotalPages] = useState('')
    const { showSuccess } = useToast()

    useEffect(() => {
        (async () => {
            try {
                const raw = await window.api.getSetting('policyExportSettings')
                if (raw) {
                    const parsed = JSON.parse(raw)
                    if (parsed.headerTitles) setHeaderTitles({ ...defaultTitles, ...parsed.headerTitles })
                    if (parsed.pageCountMap) setPageCountMap({ ...defaultPageMap, ...parsed.pageCountMap })
                    if (parsed.footerText) setFooterText(parsed.footerText)
                    if (parsed.premiumIntroText) setPremiumIntroText(parsed.premiumIntroText)
                }
            } catch { /* default */ }
            finally { setLoading(false) }
        })()
    }, [])

    const save = async () => {
        await window.api.setSetting('policyExportSettings', JSON.stringify({ headerTitles, pageCountMap, footerText, premiumIntroText }))
        showSuccess('Policy export settings saved')
    }

    const addPageCountRow = () => {
        if (!newPageCount || !newTotalPages) return
        const updated = { ...pageCountMap }
        if (!updated[newPageType]) updated[newPageType] = {}
        updated[newPageType][newPageCount] = parseInt(newTotalPages, 10)
        setPageCountMap(updated)
        setNewPageCount('')
        setNewTotalPages('')
    }

    const removePageCountRow = (type: string, pages: string) => {
        const updated = { ...pageCountMap }
        if (updated[type]) {
            delete updated[type][pages]
            if (Object.keys(updated[type]).length === 0) delete updated[type]
        }
        setPageCountMap(updated)
    }

    const typeLabels: Record<string, string> = { P: 'P&I', H: 'Hull', W: 'War' }

    if (loading) return <p style={{ color: 'var(--text-secondary)' }}>Loading...</p>

    return (
        <div>
            {/* Header Titles per Type */}
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Header Titles</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Title shown in the header of each policy type document, followed by the policy number.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
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

            <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

            {/* Page Count Mapping */}
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Page Count Mapping</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
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
                                    <button onClick={() => removePageCountRow(type, pages)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.75rem', padding: '0 2px' }}>×</button>
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '20px' }}>
                <select value={newPageType} onChange={e => setNewPageType(e.target.value)} style={{ width: '80px' }}>
                    {Object.entries(typeLabels).map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                </select>
                <input type="number" value={newPageCount} onChange={e => setNewPageCount(e.target.value)} placeholder="Pages" style={{ width: '70px' }} min={1} />
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>→</span>
                <input type="number" value={newTotalPages} onChange={e => setNewTotalPages(e.target.value)} placeholder="Total" style={{ width: '70px' }} min={1} />
                <button onClick={addPageCountRow} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }}>Add</button>
            </div>

            <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

            {/* Premium Intro Text */}
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Premium Intro Text</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Placeholders: {'{currency}'}, {'{amount}'}, {'{instalments}'}, {'{time}'}, {'{timezone}'}
            </p>
            <textarea
                value={premiumIntroText}
                onChange={e => setPremiumIntroText(e.target.value)}
                rows={3}
                style={{ width: '100%', marginBottom: '16px', resize: 'vertical' }}
            />

            <div style={{ height: '1px', background: 'var(--glass-border)', margin: '16px 0' }} />

            {/* Footer Text */}
            <h4 style={{ fontSize: '0.85rem', fontWeight: 700, marginBottom: '8px' }}>Footer Text</h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginBottom: '10px' }}>
                Optional text displayed above the page number in the footer.
            </p>
            <RichTextEditor
                value={footerText}
                onChange={setFooterText}
                minHeight={60}
            />

            <button className="btn-primary" onClick={save} style={{ padding: '6px 20px' }}>Save</button>
        </div>
    )
}

