import { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  icon?: ReactNode
  subtitle?: ReactNode
  /** Right-aligned controls (view switcher, primary action) */
  actions?: ReactNode
}

/** Standard page title row: icon + h1 + optional subtitle, actions on the right */
export default function PageHeader({ title, icon, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div style={{ minWidth: 0 }}>
        <h1>
          {icon}
          {title}
        </h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
