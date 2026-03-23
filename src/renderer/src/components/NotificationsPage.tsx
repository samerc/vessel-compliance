import React, { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import type { Notification } from '../../../shared/types'

interface NotificationsPageProps {
  onNavigate?: (linkType: string, linkId: string) => void
}

const FILTER_TABS = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'notes', label: 'Notes' },
  { id: 'policies', label: 'Policies' },
  { id: 'system', label: 'System' },
] as const

type FilterTab = (typeof FILTER_TABS)[number]['id']

const NOTE_TYPES = ['note_reply', 'note_mention']
const POLICY_TYPES = ['policy_created', 'quotation_edited', 'warranty_deadline', 'document_expiring', 'blue_card_expiring']
const SYSTEM_TYPES = ['workflow_action_needed']

function getTypeIcon(type: string) {
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

export default function NotificationsPage({ onNavigate }: NotificationsPageProps): React.JSX.Element {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    try {
      const result = await window.api.notificationsGet({ limit: 100 })
      if (result && !('error' in result)) {
        setNotifications(result.data || [])
        setUnreadCount(result.unreadCount || 0)
      }
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleMarkAllRead = async () => {
    try {
      await window.api.notificationsMarkAllRead()
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnreadCount(0)
    } catch (err) {
      console.error('Failed to mark all read:', err)
    }
  }

  const handleClick = async (notif: Notification) => {
    if (!notif.isRead) {
      try {
        await window.api.notificationsMarkRead(notif.id)
        setNotifications(prev =>
          prev.map(n => (n.id === notif.id ? { ...n, isRead: true } : n))
        )
        setUnreadCount(prev => Math.max(0, prev - 1))
      } catch (err) {
        console.error('Failed to mark read:', err)
      }
    }
    if (notif.linkType && notif.linkId && onNavigate) {
      onNavigate(notif.linkType, notif.linkId)
    }
  }

  const handleDelete = async (e: React.MouseEvent, notif: Notification) => {
    e.stopPropagation()
    try {
      await window.api.notificationsDelete(notif.id)
      setNotifications(prev => prev.filter(n => n.id !== notif.id))
      if (!notif.isRead) setUnreadCount(prev => Math.max(0, prev - 1))
    } catch (err) {
      console.error('Failed to delete notification:', err)
    }
  }

  const filtered = notifications.filter(n => {
    if (activeFilter === 'unread') return !n.isRead
    if (activeFilter === 'notes') return NOTE_TYPES.includes(n.type)
    if (activeFilter === 'policies') return POLICY_TYPES.includes(n.type)
    if (activeFilter === 'system') return SYSTEM_TYPES.includes(n.type)
    return true
  })

  return (
    <div style={{ padding: '24px 32px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0, fontWeight: 700 }}>Notifications</h1>
          {unreadCount > 0 && (
            <span style={{
              background: 'var(--danger)',
              color: '#fff',
              borderRadius: '12px',
              padding: '2px 10px',
              fontSize: '0.78rem',
              fontWeight: 700,
            }}>
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}
          >
            <CheckCheck size={15} /> Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '16px',
        padding: '4px',
        borderRadius: '8px',
        background: isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)',
      }}>
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveFilter(tab.id)}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: activeFilter === tab.id ? 600 : 400,
              background: activeFilter === tab.id
                ? (isLight ? '#fff' : 'rgba(255,255,255,0.1)')
                : 'transparent',
              color: activeFilter === tab.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
              boxShadow: activeFilter === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
          Loading...
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: 'var(--text-secondary)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
        }}>
          {activeFilter === 'all' ? <Inbox size={48} style={{ opacity: 0.3 }} /> : <Filter size={48} style={{ opacity: 0.3 }} />}
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {activeFilter === 'unread' ? 'All caught up!' : 'No notifications'}
          </div>
          <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
            {activeFilter === 'unread' ? 'You have no unread notifications' : 'Nothing to show here yet'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {filtered.map(notif => {
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
                  background: notif.isRead
                    ? 'transparent'
                    : (isLight ? 'rgba(0,170,200,0.04)' : 'rgba(0,170,200,0.06)'),
                  transition: 'background 0.15s ease',
                }}
                className="hover-effect"
              >
                {/* Icon */}
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `${typeColor}18`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: typeColor,
                  flexShrink: 0,
                  marginTop: '2px',
                }}>
                  {getTypeIcon(notif.type)}
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.88rem',
                    fontWeight: notif.isRead ? 400 : 600,
                    color: 'var(--text-primary)',
                    lineHeight: 1.4,
                  }}>
                    {notif.title}
                  </div>
                  {notif.message && (
                    <div style={{
                      fontSize: '0.8rem',
                      color: 'var(--text-secondary)',
                      marginTop: '2px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {notif.message}
                    </div>
                  )}
                  <div style={{
                    fontSize: '0.72rem',
                    color: 'var(--text-secondary)',
                    marginTop: '4px',
                    opacity: 0.7,
                  }}>
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
                    flexShrink: 0,
                  }}
                  className="hover-effect"
                  title="Delete notification"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
