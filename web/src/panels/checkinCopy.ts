// Pure formatting for the §8.2 "Generate check-in" paste-ready block —
// DASHBOARD_SPEC.md v1.28. Every number, date, and the tracking-break flag
// come straight off week.json (compute/metrics.py's week_checkin(),
// CLAUDE.md rule 3); this module only turns them into Markdown text, it
// never computes a mean, a ramp, a max, or decides whether the
// tracking-break note applies.
//
// Lightweight Markdown only, per the v1.28 amendment: one heading line,
// bullet lists, plain paragraphs, no tables, no emoji. Bold is used only
// for field labels — never for emphasis and never to signal that a number
// is good or bad. The block carries no verdict and no composite (§3.1).

import { formatMinutes } from './lastNightCopy'
import type { WeekResponse } from './week'

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Exported for reuse by weekPanelsCopy.ts (§8.2 v1.33's Planned-vs-actual
// and Ramp panels) — one km/percent formatter each, not a parallel one
// per panel.
export function formatKm(value: number): string {
  return `${value.toFixed(1)} km`
}

export function formatPct(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(0)}%`
}

export function weekHeaderLine(data: WeekResponse): string {
  if (data.week_label !== null && data.dates_label !== null) {
    return `${data.week_label} (${data.dates_label})`
  }
  return `${data.week_start} to ${data.week_end}`
}

export function volumeLine(data: WeekResponse): string {
  const planned =
    data.planned_km === null ? 'planned unknown' : `${formatKm(data.planned_km)} planned`
  return `**Volume:** ${formatKm(data.actual_km)} actual vs ${planned}`
}

export function rampLine(data: WeekResponse): string {
  if (data.ramp_pct === null) {
    return '**Ramp:** unknown — no previous-week volume to compare'
  }
  return (
    `**Ramp:** ${formatPct(data.ramp_pct)} ` +
    `(${formatKm(data.actual_km)} vs ${formatKm(data.prev_actual_km)} previous week)`
  )
}

export function complianceLines(data: WeekResponse): string[] {
  return data.sessions.map((day, i) => {
    const label = WEEKDAY_LABELS[i]
    if (day.session_type === null) {
      return `- ${label} ${day.date} — no session logged`
    }
    return `- ${label} ${day.date} — ${day.session_type}: ${day.done ?? '—'}`
  })
}

export function wellnessLines(data: WeekResponse): string[] {
  const w = data.wellness
  return [
    `- **Sleep:** ${w.sleep_mean_min === null ? '—' : `${formatMinutes(w.sleep_mean_min)} avg`} (${w.sleep_n}/7 nights)`,
    `- **RHR:** ${w.rhr_mean === null ? '—' : `${w.rhr_mean.toFixed(0)} bpm avg`} (${w.rhr_n}/7 nights)`,
    `- **HRV:** ${w.hrv_mean === null ? '—' : `${w.hrv_mean.toFixed(0)} ms avg`} (${w.hrv_n}/7 nights)`,
    `- **Shin:** ${w.shin_max === null ? '—' : `max ${w.shin_max}`} (${w.shin_answered}/7 answered)`,
  ]
}

// §8.2 v1.28 binding: only rendered when week_checkin() set
// understated_volume — states plainly that the affected volume figures
// are a floor and the ramp above is not a reliable comparison. Never a
// hidden/suppressed number here (unlike today_flag's rule 3, v1.27) —
// this block is read with context by Luca before he sends it, not
// unattended, so the numbers stay and the caveat travels with them.
export function dataQualityLine(data: WeekResponse): string | null {
  if (!data.understated_volume) return null
  return (
    `**Note:** this week's comparison spans data recorded before ${data.understated_volume_cutoff} ` +
    '(pre-device-switch tracking) — the affected volume figures are a floor, not a measurement, ' +
    'and the ramp % above is not a reliable comparison.'
  )
}

export function checkinText(data: WeekResponse): string {
  const lines = [
    `# ${weekHeaderLine(data)}`,
    '',
    volumeLine(data),
    rampLine(data),
    '',
    '**Session compliance**',
    ...complianceLines(data),
    '',
    '**Wellness**',
    ...wellnessLines(data),
  ]
  const dataQuality = dataQualityLine(data)
  if (dataQuality !== null) {
    lines.push('', dataQuality)
  }
  return lines.join('\n')
}
