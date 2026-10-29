// Shape of web/public/data/scores.json, written by compute/build_data.py's
// build_scores() from compute/metrics.py's recovery() / strain() /
// sleep_score() / score_series() / range_stats() — DASHBOARD_SPEC.md §7,
// §8.1 v1.35. A read-only mirror of that contract (CLAUDE.md rule 3):
// every number is consumed as-is, never recomputed.

export type RangeKey = '7d' | '30d' | '90d' | '6m' | '1y' | 'all'
export type ScoreKey = 'recovery' | 'strain' | 'sleep'
export type Band = 'red' | 'yellow' | 'green'

export interface RecoveryInput {
  value: number
  baseline: number | null
}

export interface Recovery {
  date: string
  score: number
  band: Band
  z: Partial<Record<RecoveryInputKey, number>>
  // weight actually applied after renormalization, sums to 1
  weights: Partial<Record<RecoveryInputKey, number>>
  inputs: Partial<Record<RecoveryInputKey, RecoveryInput>>
  trusted: boolean
}

export type RecoveryInputKey = 'hrv' | 'rhr' | 'sleep' | 'respiration' | 'prior_strain'

export interface StrainActivity {
  id: number
  date: string
  type: string
  duration_s: number | null
  avg_hr: number | null
  distance_km: number | null
}

export interface Strain {
  date: string
  strain: number
  trimp: number
  activity_trimp: number
  rest_of_day_trimp: number
  activity_share: number | null
  activities: StrainActivity[]
}

export interface SleepNight {
  sleep_total_min: number | null
  sleep_deep_min: number | null
  sleep_rem_min: number | null
  sleep_light_min: number | null
  sleep_awake_min: number | null
  sleep_start_local: string | null
  sleep_end_local: string | null
}

// v1.37: deep / REM / HRV / RHR are judged against the athlete's own
// FR70 history; `inputs` carries tonight's value and that baseline.
export type SleepPartKey = 'duration' | 'deep' | 'rem' | 'hrv' | 'rhr' | 'efficiency' | 'consistency'

export interface Sleep {
  date: string
  score: number
  behavioural_score: number // what Recovery reads: the score without HRV/RHR
  parts: Partial<Record<SleepPartKey, number>>
  // weight actually applied after renormalization, sums to 1
  weights: Partial<Record<SleepPartKey, number>>
  inputs: Partial<Record<'deep' | 'rem' | 'hrv' | 'rhr', RecoveryInput>>
  need_hours: number
  night: SleepNight | null
}

export interface SeriesEntry {
  date: string
  partial: boolean // v1.36: written by a manual sync, day still in progress
  recovery: number | null
  band: Band | null
  strain: number | null
  sleep: number | null
}

export interface RangeStats {
  mean: number
  min: number
  max: number
  n: number
  delta: number | null
}

export interface ScoreRange {
  start: string
  locked: boolean
  unlocks_on: string | null
  stats: RangeStats | null
}

export interface ScoresResponse {
  as_of: string
  data_through_ms: number | null // newest HR sample on a partial day
  partial_dates: string[]
  recovery: Recovery | null
  recovery_calibrating: { n: number; required: number } | null
  strain: Strain | null
  sleep: Sleep | null
  series: SeriesEntry[]
  week_start: string
  ranges: Record<ScoreKey, Record<RangeKey, ScoreRange>>
  range_options: RangeKey[]
}

// Hex, not var(--…): these feed SVG gradient stops and ECharts, neither of
// which resolves CSS custom properties reliably. Same values as §10's tokens.
export const BAND_COLOR: Record<Band, string> = {
  red: '#E0523F',
  yellow: '#E8C14B',
  green: '#22C98A',
}

export const COLOR = {
  strain: '#3F82D8',
  sleep: '#9FB0C2',
  rhr: '#E07A4F',
  accent: '#5AA2F0',
  amber: '#D4A017',
  green: '#22C98A',
  violet: '#8F7CF0',
}

export const STRAIN_MAX = 21
