// Shape of web/public/data/shin_series.json, written by
// compute/build_data.py from compute/metrics.py's shin_series() —
// DASHBOARD_SPEC.md §7's shin_series row, §8.3. This is a read-only
// mirror of that contract, not a second definition of it (CLAUDE.md rule
// 3): every field here is consumed as-is, never recomputed or
// reinterpreted.

export type ShinBand = 'in_band' | 'out_of_band' | 'not_answered'

export interface ShinSeriesDay {
  date: string // ISO 8601, e.g. "2026-08-08"
  shin: 0 | 1 | 2 | 3 | null
  rolling_7d_km: number
  band: ShinBand
  understated_volume: boolean
}

export interface ShinSeriesCoverage {
  answered: number
  total: number
}

export interface ShinSeriesResponse {
  series: ShinSeriesDay[]
  coverage: ShinSeriesCoverage
}
