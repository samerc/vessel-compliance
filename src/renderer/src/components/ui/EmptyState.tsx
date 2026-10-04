import React, { ReactNode } from 'react'

interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  text?: ReactNode
  /** Usually one button that resolves the empty state (e.g. Create, Clear filters) */
  action?: ReactNode
  compact?: boolean
}

export default function EmptyState({
  icon,
  title,
  text,
  action,
  compact
}: EmptyStateProps): React.JSX.Element {
  return (
    <div className="empty-state" style={compact ? { padding: '28px 16px' } : undefined}>
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
