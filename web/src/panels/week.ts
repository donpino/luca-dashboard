// Shape of web/public/data/week.json, written by compute/build_data.py's
// build_week() from compute/metrics.py's week_checkin() — DASHBOARD_SPEC.md
// §8.2, v1.28 amendment. This is a read-only mirror of that contract, not a
// second definition of it (CLAUDE.md rule 3): every field here is consumed
// as-is, never recomputed or reinterpreted.

export interface WeekSessionDay {
  date: string // ISO 8601
  session_type: string | null
  done: string | null
}

export interface WeekWellness {
  sleep_mean_min: number | null
  sleep_n: number
  rhr_mean: number | null
  rhr_n: number
  hrv_mean: number | null
  hrv_n: number
  shin_max: number | null
  shin_answered: number
}

export interface WeekResponse {
  week_start: string // ISO 8601, Monday
  week_end: string // ISO 8601, Sunday
  // Both null together when no `weekly` row exists for week_start —
  // never partially populated (CLAUDE.md rule 3: metrics.py decides this,
  // not the frontend).
  week_label: string | null
  dates_label: string | null
  actual_km: number
  // Null means "no weekly row, so planned is unknown" — never 0 and
  // never an omitted line (§8.2 v1.28).
  planned_km: number | null
  prev_actual_km: number
  // Null when prev_actual_km is 0 — ramp % is undefined, not 0 or ∞.
  ramp_pct: number | null
  // Always exactly 7 entries, Monday first, Sunday last.
  sessions: WeekSessionDay[]
  wellness: WeekWellness
  // True when this week or its comparison week (the ramp's prev week)
  // touches a date before understated_volume_cutoff (§7/§8.3 v1.7).
  understated_volume: boolean
  understated_volume_cutoff: string // ISO 8601
}
