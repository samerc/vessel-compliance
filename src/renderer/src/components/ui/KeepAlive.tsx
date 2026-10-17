import { ReactNode, useState } from 'react'

interface KeepAliveProps<K extends string> {
  /** The visible tab */
  active: K
  /** Every tab's content; a tab is mounted on its first visit and then kept */
  panes: Record<K, () => ReactNode>
}

/**
 * Tab panes that keep their state: a tab mounts the first time it is opened and is then only
 * hidden, so switching tabs never loses a half-filled report or calculator
 */
export default function KeepAlive<K extends string>({
  active,
  panes
}: KeepAliveProps<K>): React.JSX.Element {
  const [visited, setVisited] = useState<K[]>([active])
  // Adjust state during render: remember a newly opened tab
  if (!visited.includes(active)) setVisited([...visited, active])
  return (
    <>
      {(Object.keys(panes) as K[])
        .filter((k) => k === active || visited.includes(k))
        .map((k) => (
          <div key={k} role="tabpanel" hidden={k !== active}>
            {panes[k]()}
          </div>
        ))}
    </>
  )
}
