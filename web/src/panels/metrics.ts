// Shape of web/public/data/metrics.json (and days/<date>.json's `metrics`),
// written by compute/build_data.py's _metrics_payload() — DASHBOARD_SPEC.md
// §8.1 v1.41, the metric cards' detail pages. Read-only mirror (CLAUDE.md
// rule 3): every value is a raw nightly reading or a metrics.py output.

import type { RangeKey, ScoreRange } from './scores'

export type MetricKey = 'hrv' | 'rhr' | 'sleep_min' | 'weekly_km'

export interface MetricDay {
  date: string
  hrv: number | null
  rhr: number | null
  sleep_min: number | null
  rhr_band: [number, number] | null // the band as it stood that day
}

export interface MetricWeek {
  date: string // Monday
  weekly_km: number
}

export interface MetricsResponse {
  as_of: string
  series: MetricDay[]
  weeks: MetricWeek[]
  ranges: Record<MetricKey, Record<RangeKey, ScoreRange>>
  range_options: RangeKey[]
}
