import { ReactNode, CSSProperties } from 'react'

export type BadgeTone = 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'violet' | 'neutral'

interface BadgeProps {
  tone?: BadgeTone
  /** Any CSS color (hex or var) instead of a tone, e.g. a user-chosen status color */
  color?: string
  dot?: boolean
  title?: string
  style?: CSSProperties
  children: ReactNode
}

/** Status pill. Tints are derived from the text color, so it works in every theme */
export default function Badge({
  tone = 'neutral',
  color,
  dot,
  title,
  style,
  children
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={`badge badge-${tone}${dot ? ' badge-dot' : ''}`}
      title={title}
      style={color ? { ['--badge-color' as string]: color, ...style } : style}
    >
      {children}
    </span>
  )
}
