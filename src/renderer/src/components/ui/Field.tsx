import { ReactNode } from 'react'

interface FieldProps {
  label: ReactNode
  children: ReactNode
  /** id of the control, so clicking the label focuses it */
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Grid columns to take inside a .form-grid */
  span?: 2 | 'all'
  className?: string
}

/** Label above its control, with an optional hint or error below. Place inside a .form-grid */
export default function Field({
  label,
  children,
  htmlFor,
  hint,
  error,
  required,
  span,
  className
}: FieldProps): React.JSX.Element {
  const cls = ['field', span === 2 ? 'span-2' : span === 'all' ? 'span-all' : '', className || '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className={cls}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        hint && <span className="field-hint">{hint}</span>
      )}
    </div>
  )
}
