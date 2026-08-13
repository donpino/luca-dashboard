// Pure formatting helpers for the §8.1 "Last night" panel — kept
// side-effect free and unit-tested the same way shinVolumeChart.ts's
// coverageText/minimumDataNote are. Every fact here (device, dates) comes
// straight off the JSON (CLAUDE.md rule 3); this module only turns them
// into copy, it never computes a new one.

import type { LastNight } from './today'

// DASHBOARD_SPEC.md §8.1 v1.26 amendment, binding wording: state once per
// panel, not per metric, that (1) there is no reference band yet, (2)
// Amazfit baselines don't transfer to the FR70, (3) the approximate date
// a band becomes possible. No Amazfit numbers appear here — the panel
// must not use them, only say they don't carry over.
export function noBandNote(lastNight: Pick<LastNight, 'band_possible_from'>): string {
  return (
    'No reference band yet — the old Amazfit baselines don’t carry over to the FR70. ' +
    `Expect one from around ${lastNight.band_possible_from}.`
  )
}

export function formatMinutes(min: number | null): string {
  if (min === null) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return `${h}h ${m}m`
}

export function formatUnit(value: number | null, unit: string): string {
  return value === null ? '—' : `${value}${unit}`
}

// "MM-DD" to match shinVolumeChart's axis-date convention (§10: mono for
// all figures, no year needed — the value list never spans a year).
export function formatShortDate(iso: string): string {
  return iso.slice(5)
}
