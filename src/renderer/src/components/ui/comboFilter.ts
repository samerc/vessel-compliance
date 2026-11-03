/** Default pick-list search: every word of the query in the label or the detail */
export function defaultComboFilter<T>(
  options: T[],
  query: string,
  getLabel: (o: T) => string,
  getDetail?: (o: T) => string | null | undefined
): T[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return options
  return options.filter((o) => {
    const hay = `${getLabel(o)} ${getDetail?.(o) || ''}`.toLowerCase()
    return words.every((w) => hay.includes(w))
  })
}
