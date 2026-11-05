/** Not a party of the policy: the broker is the policy's customer */
export const isCareOfRole = (role: string | null | undefined): boolean =>
  (role || '').toLowerCase().replace(/[^a-z]/g, '') === 'co'

/** The day before an ISO date: the old assured ends the day before the new one starts */
export function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

export const todayIso = (): string => new Date().toISOString().slice(0, 10)

/** The vessel's name on a date: the first former name that was still in use then, else today's */
export function vesselNameAt(
  date: string | null | undefined,
  history: { previousName: string; changedAt: string }[],
  currentName: string
): string {
  if (!date) return currentName
  const day = String(date).slice(0, 10)
  const later = history
    .filter((h) => String(h.changedAt).slice(0, 10) > day)
    .sort((a, b) => String(a.changedAt).localeCompare(String(b.changedAt)))
  return later[0]?.previousName || currentName
}
