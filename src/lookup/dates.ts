/**
 * Converts the DD/MM/YYYY dates the GST APIs return into ISO yyyy-mm-dd.
 * Returns undefined rather than throwing — an unparseable date should
 * degrade a signal to "unknown", not break the whole assessment.
 */
export function toIsoDate(value: string | undefined | null): string | undefined {
  if (!value) return undefined

  const trimmed = String(value).trim()

  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (dmy) {
    const [, d, m, y] = dmy
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  return undefined
}

/** Whole days between an ISO date and `now`. Negative when the date is in the future. */
export function daysSince(isoDate: string | undefined, now: Date): number | undefined {
  if (!isoDate) return undefined
  const then = Date.parse(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(then)) return undefined
  return Math.floor((now.getTime() - then) / 86_400_000)
}
