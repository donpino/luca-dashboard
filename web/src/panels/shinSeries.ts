// Shape of web/public/data/shin_series.json, written by
// compute/build_data.py from compute/metrics.py's shin_series() —
// DASHBOARD_SPEC.md §7's shin_series row, §8.3. This is a read-only
// mirror of that contract, not a second definition of it (CLAUDE.md rule
// 3): every field here is consumed as-is, never recomputed or
// reinterpreted.

export type ShinBand = 'in_band' | 'out_of_band' | 'not_answered'

// §9's global range selector, scoped to this panel for now (v1.18) — see
// DASHBOARD_SPEC.md's v1.18 amendment.
export type RangeKey = '7d' | '30d' | '90d' | '6m' | '1y' | 'all'

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
  // Widest range this build ever emits (DATA_START..today, v1.18) — the
  // range selector filters this client-side by date; it is never
  // re-fetched or recomputed per range (CLAUDE.md rule 3).
  series: ShinSeriesDay[]
  // Coverage across the full emitted range above (equal to
  // coverage_by_range.all) — kept for any direct consumer of this JSON
  // outside the panel. The panel itself reads coverage_by_range.
  coverage: ShinSeriesCoverage
  range_options: RangeKey[]
  default_range: RangeKey
  // ISO date string per range key — compute/build_data.py's own
  // `_range_start`, read as-is so the frontend never recomputes a
  // range's boundary (CLAUDE.md rule 3).
  range_start: Record<RangeKey, string>
  coverage_by_range: Record<RangeKey, ShinSeriesCoverage>
}
