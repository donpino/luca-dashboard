// All date handling in /log is local-calendar arithmetic on purpose —
// `new Date('2026-08-08')` parses as UTC midnight and can display the wrong
// day depending on the browser's offset. Every function here works off
// Date's local getters/setters instead, so DST transitions and the day
// boundary land on the calendar day the athlete actually sees.

export function toLocalISODate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function parseLocalISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// DASHBOARD_SPEC.md §8.5: defaults to today, except before 04:00 local time,
// when it defaults to yesterday. "Before 04:00" is strictly less than —
// exactly 04:00:00 already defaults to today.
export function defaultLogDate(now: Date = new Date()): string {
  const effective = new Date(now)
  if (now.getHours() < 4) {
    effective.setDate(effective.getDate() - 1)
  }
  return toLocalISODate(effective)
}

export function addLocalDays(dateStr: string, delta: number): string {
  const d = parseLocalISODate(dateStr)
  d.setDate(d.getDate() + delta)
  return toLocalISODate(d)
}

// True calendar-today, independent of the 04:00 logging cutover — this is
// the ceiling for the date picker. Future dates are rejected regardless of
// what day logging currently defaults to.
export function todayISODate(now: Date = new Date()): string {
  return toLocalISODate(now)
}
