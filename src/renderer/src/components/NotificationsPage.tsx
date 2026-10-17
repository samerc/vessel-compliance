import React, { useState, useEffect, useRef } from 'react'
import {
  Bell,
  MessageCircle,
  GitBranch,
  FileCheck,
  Edit3,
  AlertTriangle,
  Clock,
  CreditCard,
  CheckCheck,
  Trash2,
  Filter,
  Inbox,
  RefreshCw
} from 'lucide-react'
import { PageHeader, Badge, SegmentedControl, EmptyState, Spinner } from './ui'
import { useToast } from '../contexts/ToastContext'
import type { Notification } from '../../../shared/types'

interface NotificationsPageProps {
  onNavigate?: (linkType: string, linkId: string) => void
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'notes', label: 'Notes' },
  { id: 'policies', label: 'Policies' },
  { id: 'system', label: 'System' }
] as const

type FilterTab = (typeof FILTER_TABS)[number]['id']

const NOTE_TYPES = ['note_reply', 'note_mention']
const POLICY_TYPES = [
  'policy_created',
  'quotation_edited',
  'warranty_deadline',
  'document_expiring',
  'blue_card_expiring'
]
const SYSTEM_TYPES = ['workflow_action_needed']

function getTypeIcon(type: string): React.JSX.Element {
  switch (type) {
    case 'note_reply':
    case 'note_mention':
      return <MessageCircle size={16} />
    case 'workflow_action_needed':
      return <GitBranch size={16} />
    case 'policy_created':
      return <FileCheck size={16} />
    case 'quotation_edited':
      return <Edit3 size={16} />
    case 'warranty_deadline':
      return <AlertTriangle size={16} />
    case 'document_expiring':
      return <Clock size={16} />
    case 'blue_card_expiring':
      return <CreditCard size={16} />
    default:
      return <Bell size={16} />
  }
}

function getTypeColor(type: string): string {
  switch (type) {
    case 'note_reply':
    case 'note_mention':
      return '#00aac8'
    case 'workflow_action_needed':
      return '#f59e0b'
    case 'policy_created':
      return '#22c55e'
    case 'quotation_edited':
      return '#6464ff'
    case 'warranty_deadline':
      return '#ef4444'
    case 'document_expiring':
      return '#f59e0b'
    case 'blue_card_expiring':
      return '#8b5cf6'
    default:
      return '#6b7280'
  }
}

function relativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return 'yesterday'
  if (diffDay < 30) return `${diffDay} days ago`
  return date.toLocaleDateString()
}

export default function NotificationsPage({
  onNavigate
}: NotificationsPageProps): React.JSX.Element {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)
  const { showError } = useToast()
  const PAGE = 100
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let alive = true
    const run = async (): Promise<void> => {
      setLoading(true)
      try {
        const result = await window.api.notificationsGet({ limit: PAGE })
        if (alive && result && !('error' in result)) {
          setNotifications(result.data || [])
          setUnreadCount(result.unreadCount || 0)
          setHasMore((result.data || []).length === PAGE)
        }
      } catch (err) {
        if (alive)
          showError((err instanceof Error && err.message) || 'Failed to load notifications')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => {
      alive = false
    }
  }, [reloadKey, showError])

  const loadMore = async (): Promise<void> => {
    setLoadingMore(true)
    try {
      const result = await window.api.notificationsGet({
        limit: PAGE,
        offset: notifications.length
      })
      if (result && !('error' in result)) {
        const more = result.data || []
        setNotifications((prev) => [
          ...prev,
          ...more.filter((m) => !prev.some((p) => p.id === m.id))
        ])
        setHasMore(more.length === PAGE)
      }
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to load more notifications')
    } finally {
      setLoadingMore(false)
    }
  }

  // Delete with undo: the notification leaves the list at once and is deleted 6 s later
  // unless Undo is clicked (or right away when another one is deleted / the page closes)
  const [pendingDelete, setPendingDelete] = useState<Notification | null>(null)
  const pendingRef = useRef<{ notif: Notification; timer: ReturnType<typeof setTimeout> } | null>(
    null
  )
  const commitDelete = (notif: Notification): void => {
    window.api.notificationsDelete(notif.id).catch((err) => {
      showError((err instanceof Error && err.message) || 'Failed to delete the notification')
      setNotifications((prev) => [notif, ...prev])
    })
  }
  useEffect(
    () => () => {
      // Leaving the page: the pending delete goes through
      if (pendingRef.current) {
        clearTimeout(pendingRef.current.timer)
        void window.api.notificationsDelete(pendingRef.current.notif.id).catch(() => {})
      }
    },
    []
  )

  const handleMarkAllRead = async (): Promise<void> => {
    try {
      await window.api.notificationsMarkAllRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (err) {
      showError((err instanceof Error && err.message) || 'Failed to mark all as read')
    }
  }

  const handleClick = async (notif: Notification): Promise<void> => {
    if (!notif.isRead) {
      try {
        await window.api.notificationsMarkRead(notif.id)
        setNotifications((prev) =>
          prev.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch (err) {
        showError((err instanceof Error && err.message) || 'Failed to mark as read')
      }
    }
    if (notif.linkType && notif.linkId && onNavigate) {
      onNavigate(notif.linkType, notif.linkId)
    }
  }

  const handleDelete = async (e: React.MouseEvent, notif: Notification): Promise<void> => {
    e.stopPropagation()
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer)
      commitDelete(pendingRef.current.notif)
    }
    setNotifications((prev) => prev.filter((n) => n.id !== notif.id))
    if (!notif.isRead) setUnreadCount((prev) => Math.max(0, prev - 1))
    const timer = setTimeout(() => {
      pendingRef.current = null
      setPendingDelete(null)
      commitDelete(notif)
    }, 6000)
    pendingRef.current = { notif, timer }
    setPendingDelete(notif)
  }

  const undoDelete = (): void => {
    const p = pendingRef.current
    if (!p) return
    clearTimeout(p.timer)
    pendingRef.current = null
    setPendingDelete(null)
    setNotifications((prev) =>
      [...prev, p.notif].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    )
    if (!p.notif.isRead) setUnreadCount((n) => n + 1)
  }

  const filtered = notifications.filter((n) => {
    if (activeFilter === 'unread') return !n.isRead
    if (activeFilter === 'notes') return NOTE_TYPES.includes(n.type)
    if (activeFilter === 'policies') return POLICY_TYPES.includes(n.type)
    if (activeFilter === 'system') return SYSTEM_TYPES.includes(n.type)
    return true
  })

  return (
    <div className="fade-in page" style={{ maxWidth: '900px' }}>
      <PageHeader
        icon={<Bell size={26} />}
        title={
          <>Notifications {unreadCount > 0 && <Badge tone="danger">{unreadCount} unread</Badge>}</>
        }
        actions={
          <>
            <button
              onClick={() => setReloadKey((k) => k + 1)}
              className="btn-secondary"
              disabled={loading}
              title="Check for new notifications"
            >
              <RefreshCw size={15} /> Refresh
            </button>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead} className="btn-secondary">
                <CheckCheck size={15} /> Mark All Read
              </button>
            )}
          </>
        }
      />
      {pendingDelete && (
        <div
          role="status"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 14px',
            marginBottom: '12px',
            borderRadius: '8px',
            background: 'var(--bg-card)',
            border: 'var(--glass-border)',
            fontSize: '0.85rem'
          }}
        >
          Notification deleted.
          <button className="btn-ghost btn-sm" onClick={undoDelete}>
            Undo
          </button>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ marginBottom: '16px' }}>
        <SegmentedControl
          value={activeFilter}
          onChange={setActiveFilter}
          items={FILTER_TABS.map((t) => ({ key: t.id, label: t.label }))}
        />
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={activeFilter === 'all' ? <Inbox size={40} /> : <Filter size={40} />}
          title={activeFilter === 'unread' ? 'All caught up!' : 'No notifications'}
          text={
            activeFilter === 'unread'
              ? 'You have no unread notifications'
              : 'Nothing to show here yet'
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {filtered.map((notif) => {
            const typeColor = getTypeColor(notif.type)
            return (
              <div
                key={notif.id}
                onClick={() => handleClick(notif)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '12px 14px',
                  borderRadius: '8px',
                  cursor: notif.linkType ? 'pointer' : 'default',
                  borderLeft: notif.isRead ? '3px solid transparent' : `3px solid ${typeColor}`,
                  background: notif.isRead ? 'transparent' : 'var(--row-hover)',
                  transition: 'background 0.15s ease'
                }}
                className="hover-effect"
              >
                {/* Icon */}
                <div
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: `${typeColor}18`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: typeColor,
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  {getTypeIcon(notif.type)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: notif.isRead ? 400 : 600,
                      color: 'var(--text-primary)',
                      lineHeight: 1.4
                    }}
                  >
                    {notif.title}
                  </div>
                  {notif.message && (
                    <div
                      style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        marginTop: '2px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {notif.message}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '0.72rem',
                      color: 'var(--text-secondary)',
                      marginTop: '4px',
                      opacity: 0.7
                    }}
                  >
                    {relativeTime(notif.createdAt)}
                  </div>
                </div>

                {/* Delete */}
                <button
                  onClick={(e) => handleDelete(e, notif)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-secondary)',
                    padding: '4px',
                    borderRadius: '4px',
                    opacity: 0.5,
                    flexShrink: 0
                  }}
                  className="hover-effect"
                  title="Delete notification"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
          {hasMore && activeFilter === 'all' && (
            <div style={{ textAlign: 'center', padding: '12px' }}>
              <button
                className="btn-secondary btn-sm"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? <Spinner label="Loading..." /> : 'Load older notifications'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
