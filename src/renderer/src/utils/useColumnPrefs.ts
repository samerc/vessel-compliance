import { useEffect, useRef, useState } from 'react'

// Per-user visible table columns (user_column_prefs), used with <ColumnSelector />

export interface ColumnDef {
  id: string
  label: string
  defaultVisible: boolean
}

export function useColumnPrefs(
  pageKey: string,
  allColumns: ColumnDef[]
): {
  visibleColumns: string[]
  setVisibleColumns: (cols: string[]) => void
  loaded: boolean
} {
  const [visibleColumns, setVisibleColumnsState] = useState<string[]>(() =>
    allColumns.filter((c) => c.defaultVisible).map((c) => c.id)
  )
  const [loaded, setLoaded] = useState(false)
  // Callers often build the column list during render: read the latest one without refetching
  const columnsRef = useRef(allColumns)
  useEffect(() => {
    columnsRef.current = allColumns
  })

  useEffect(() => {
    window.api
      .columnPrefsGet(pageKey)
      .then((saved) => {
        if (saved && Array.isArray(saved)) {
          // Filter to only valid column IDs
          const validIds = new Set(columnsRef.current.map((c) => c.id))
          const filtered = saved.filter((id) => validIds.has(id))
          if (filtered.length > 0) {
            setVisibleColumnsState(filtered)
          }
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [pageKey])

  const setVisibleColumns = (cols: string[]): void => {
    setVisibleColumnsState(cols)
    window.api.columnPrefsSet(pageKey, cols).catch(() => {})
  }

  return { visibleColumns, setVisibleColumns, loaded }
}
