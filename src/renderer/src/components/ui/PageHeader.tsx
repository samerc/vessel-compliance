import { ReactNode } from 'react'
import { HelpCircle } from 'lucide-react'
import { openPageHelp } from '../../utils/pageHelp'

interface PageHeaderProps {
  title: ReactNode
  icon?: ReactNode
  subtitle?: ReactNode
  /** Right-aligned controls (view switcher, primary action) */
  actions?: ReactNode
  /** Hide the ? button (wiki topics about this page) */
  noHelp?: boolean
}

/** Standard page title row: icon + h1 + optional subtitle, actions on the right */
export default function PageHeader({
  title,
  icon,
  subtitle,
  actions,
  noHelp
}: PageHeaderProps): React.JSX.Element {
  return (
    <header className="page-header">
      <div style={{ minWidth: 0 }}>
        <h1>
          {icon}
          {title}
        </h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {(actions || !noHelp) && (
        <div className="page-actions">
          {actions}
          {!noHelp && (
            <button
              className="btn-ghost btn-icon btn-sm"
              onClick={openPageHelp}
              title="Help: wiki topics about this page (F1)"
              aria-label="Help for this page"
            >
              <HelpCircle size={16} />
            </button>
          )}
        </div>
      )}
    </header>
  )
}
