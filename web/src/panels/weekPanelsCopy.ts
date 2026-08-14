// Pure formatting/state helpers for §8.2's four render-layer panels —
// DASHBOARD_SPEC.md v1.33: Planned vs actual km, Ramp %, Session
// compliance grid, Wellness summary. Every value read here already
// exists on week.json (compute/metrics.py's week_checkin(), CLAUDE.md
// rule 3); this module only turns it into panel copy or a display
// state, it never computes a mean, a ramp, or a max itself. Reuses
// formatKm/formatPct (checkinCopy.ts) and formatMinutes (lastNightCopy.ts)
// rather than writing parallel ones.

import { formatKm, formatPct } from './checkinCopy'
import { formatMinutes } from './lastNightCopy'
import type { WeekResponse, WeekSessionDay, WeekWellness } from './week'

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function weekdayLabel(index: number): string {
  return WEEKDAY_LABELS[index]
}

// ---- Planned vs actual km ----

export function actualKmText(data: Pick<WeekResponse, 'actual_km'>): string {
  return formatKm(data.actual_km)
}

// No `weekly` row means planned is unknown — never rendered as 0 or
// omitted (§8.2 v1.33, same contract as checkinCopy's volumeLine).
export function plannedKmText(data: Pick<WeekResponse, 'planned_km'>): string {
  return data.planned_km === null ? 'unknown — no weekly row' : formatKm(data.planned_km)
}

// ---- Ramp % ----

// A null ramp is undefined, never 0% — same InsufficientData contract
// ramp_pct itself carries (§7).
export function rampPctText(data: Pick<WeekResponse, 'ramp_pct'>): string {
  return data.ramp_pct === null ? 'unknown' : formatPct(data.ramp_pct)
}

export function rampDetailText(
  data: Pick<WeekResponse, 'ramp_pct' | 'actual_km' | 'prev_actual_km'>,
): string {
  if (data.ramp_pct === null) {
    return 'No previous-week volume to compare.'
  }
  return `${formatKm(data.actual_km)} vs ${formatKm(data.prev_actual_km)} previous week`
}

// ---- understated-volume caveat, shared by both volume panels above ----
// Plain-text sibling of checkinCopy.ts's dataQualityLine (which wraps the
// same substance in `**Note:**` Markdown for the paste block) — this one
// renders as panel__note in the UI, same content, different destination.
// §8.2 v1.28's caveat extended to these two render-layer panels in v1.33;
// deliberately not applied to the compliance or wellness panels below,
// which this flag does not describe.
export function understatedVolumeNote(
  data: Pick<WeekResponse, 'understated_volume_cutoff'>,
): string {
  return (
    `Spans data recorded before ${data.understated_volume_cutoff} (pre-device-switch tracking) — ` +
    'these volume figures are a floor, not a measurement, and the ramp % is not a reliable comparison.'
  )
}

// ---- Session compliance grid ----

export type ComplianceState = 'yes' | 'partial' | 'no' | 'pending' | 'no-row'

// A day with no `sessions` row is a fifth, distinct state — an absent
// plan, not a missed session (§8.2 v1.33 binding). Keyed off `done`
// being null, which `session_for_date` (compute/metrics.py) only
// returns when no row exists for that date at all; every real row's
// `done` is one of the four checked values
// (db/migrations/006_sessions_weekly_benchmarks.sql, sessions_done_check).
export function complianceState(day: Pick<WeekSessionDay, 'done'>): ComplianceState {
  switch (day.done) {
    case 'Yes':
      return 'yes'
    case 'Partial':
      return 'partial'
    case 'No':
      return 'no'
    case 'Pending':
      return 'pending'
    default:
      return 'no-row'
  }
}

// Short label for the compact grid cell — "No plan" is deliberately not
// "No": the former is an absent row, the latter a logged, missed session.
export function complianceLabel(state: ComplianceState): string {
  switch (state) {
    case 'yes':
      return 'Yes'
    case 'partial':
      return 'Partial'
    case 'no':
      return 'No'
    case 'pending':
      return 'Pending'
    case 'no-row':
      return 'No plan'
  }
}

// ---- Wellness summary ----
// Each mean is stated with its own night count so a mean over 3 nights
// never reads like a mean over 7 (§8.2 v1.33) — a null mean is "no data",
// never 0 (§5's null rule, CLAUDE.md rule 12).

export function sleepMeanText(w: Pick<WeekWellness, 'sleep_mean_min'>): string {
  return w.sleep_mean_min === null ? 'no data' : `${formatMinutes(w.sleep_mean_min)} avg`
}

export function rhrMeanText(w: Pick<WeekWellness, 'rhr_mean'>): string {
  return w.rhr_mean === null ? 'no data' : `${w.rhr_mean.toFixed(0)} bpm avg`
}

export function hrvMeanText(w: Pick<WeekWellness, 'hrv_mean'>): string {
  return w.hrv_mean === null ? 'no data' : `${w.hrv_mean.toFixed(0)} ms avg`
}

export function nightCountText(n: number): string {
  return `${n}/7 nights`
}

// Shin is the max over the week's *answered* days only — a null max
// means nothing was answered, never printed as 0 (§5's null rule).
export function shinMaxText(w: Pick<WeekWellness, 'shin_max'>): string {
  return w.shin_max === null ? 'no data' : `max ${w.shin_max}`
}

export function shinCoverageText(w: Pick<WeekWellness, 'shin_answered'>): string {
  return `${w.shin_answered}/7 answered`
}
