// Shape of web/public/data/today.json, written by compute/build_data.py's
// build_today() from compute/metrics.py's last_night() / session_for_date()
// / today_flag() — DASHBOARD_SPEC.md §8.1, v1.26 amendment. This is a
// read-only mirror of that contract, not a second definition of it
// (CLAUDE.md rule 3): every field here is consumed as-is, never
// recomputed or reinterpreted.

export interface LastNightNight {
  date: string // ISO 8601
  sleep_total_min: number | null
  rhr: number | null
  hrv_overnight: number | null
}

export interface LastNight extends LastNightNight {
  device: 'fr70' | 'amazfit'
  // First date on the current device — the value list never includes an
  // earlier date than this (CLAUDE.md rule 5: never crosses the break).
  device_since: string
  // Every night on the current device up to and including `date`.
  values: LastNightNight[]
  // Computed date the ~21-night HRV Status window is first satisfied on
  // this device — no band exists before this date, and none is rendered
  // here even after it (§8.1 v1.26: this panel defers the band, it
  // doesn't build one).
  band_possible_from: string
}

export interface TodaySession {
  session_type: string | null
  purpose: string | null
  prescription: string | null
  done: string | null
}

export interface ShinFlag {
  kind: 'shin'
  date: string
  shin: 1 | 2 | 3
}

export interface IllnessFlag {
  kind: 'illness'
  date: string
}

export interface VolumeRampFlag {
  kind: 'volume_ramp'
  window_end: string
  current_7d_km: number
  prev_7d_km: number
  pct: number
}

export type TodayFlag = ShinFlag | IllnessFlag | VolumeRampFlag

export interface TodayResponse {
  date: string
  last_night: LastNight | null
  session: TodaySession | null
  flag: TodayFlag | null
}
