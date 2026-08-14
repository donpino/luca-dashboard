// §8.1 Panel 1 — "Last night". Presentational only: every value and every
// date comes straight from web/public/data/today.json's last_night field
// (compute/metrics.py's last_night(), CLAUDE.md rule 3) — this component
// formats and lays out, it does not compute. No band is drawn here — see
// noBandNote's docstring and DASHBOARD_SPEC.md's v1.26 amendment for why.
//
// v1.29 amendment: the value list became three sparklines, one per metric,
// hand-rolled inline SVG (no charting library — Today stays ECharts-free).
// Binding rules this component must not violate: each sparkline states its
// own min/max beside it (an unscaled box misreads a small spread as a big
// one); a null value breaks the line rather than bridging it
// (sparkline.ts's sparklineSegments); no trend line, slope, arrow, or
// direction word — the shape is all that's shown (§3.1); and below three
// non-null points the metric renders as plain text, since two points drawn
// as a line is itself a trend claim.

import { formatMinutes, formatMinutesRange, formatShortDate, formatUnit, formatUnitRange, noBandNote } from './lastNightCopy'
import { hasEnoughPointsForLine, sparklineExtent, sparklinePoints, sparklineSegments } from './sparkline'
import type { LastNight, LastNightNight } from './today'

const SPARK_WIDTH = 120
const SPARK_HEIGHT = 32

type NightMetricKey = 'sleep_total_min' | 'rhr' | 'hrv_overnight'

interface MetricConfig {
  key: NightMetricKey
  label: string
  formatValue: (value: number | null) => string
  formatRange: (min: number, max: number) => string
}

const METRICS: MetricConfig[] = [
  {
    key: 'sleep_total_min',
    label: 'Sleep',
    formatValue: formatMinutes,
    formatRange: formatMinutesRange,
  },
  {
    key: 'rhr',
    label: 'RHR',
    formatValue: (v) => formatUnit(v, ' bpm'),
    formatRange: (min, max) => formatUnitRange(min, max, ' bpm'),
  },
  {
    key: 'hrv_overnight',
    label: 'HRV',
    formatValue: (v) => formatUnit(v, ' ms'),
    formatRange: (min, max) => formatUnitRange(min, max, ' ms'),
  },
]

function Sparkline({ values, label }: { values: (number | null)[]; label: string }) {
  const extent = sparklineExtent(values)
  if (extent === null) return null
  const segments = sparklineSegments(values)
  return (
    <svg
      viewBox={`0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`}
      preserveAspectRatio="none"
      className="last-night__spark"
      role="img"
      aria-label={`${label} shape over the current device era`}
    >
      {segments.map((segment) => (
        <g key={segment[0].index}>
          {segment.length > 1 && (
            <polyline
              className="last-night__spark-line"
              points={sparklinePoints(segment, values.length, extent.min, extent.max, SPARK_WIDTH, SPARK_HEIGHT)}
            />
          )}
          {segment.map((point) => {
            const [x, y] = sparklinePoints([point], values.length, extent.min, extent.max, SPARK_WIDTH, SPARK_HEIGHT)
              .split(',')
              .map(Number)
            return <circle key={point.index} className="last-night__spark-dot" cx={x} cy={y} r={1.6} />
          })}
        </g>
      ))}
    </svg>
  )
}

function MetricRow({ metric, current, values }: { metric: MetricConfig; current: number | null; values: LastNightNight[] }) {
  const series = values.map((night) => night[metric.key])
  const extent = sparklineExtent(series)

  return (
    <div className="last-night__row">
      <div className="last-night__row-head">
        <span className="last-night__label">{metric.label}</span>
        <span className="mono last-night__row-value">{metric.formatValue(current)}</span>
      </div>
      {extent !== null && hasEnoughPointsForLine(series) ? (
        <div className="last-night__row-chart">
          <Sparkline values={series} label={metric.label} />
          <span className="mono last-night__row-range">{metric.formatRange(extent.min, extent.max)}</span>
        </div>
      ) : (
        <p className="mono last-night__row-fallback">
          {values.map((night) => `${formatShortDate(night.date)} ${metric.formatValue(night[metric.key])}`).join(' · ')}
        </p>
      )}
    </div>
  )
}

export default function LastNightPanel({ data }: { data: LastNight | null }) {
  return (
    <section className="panel" aria-label="Last night">
      <h2 className="panel__title">Last night</h2>
      {data === null ? (
        <p className="status-text status-text--muted">No biometrics recorded yet.</p>
      ) : (
        <>
          <div className="last-night__rows">
            {METRICS.map((metric) => (
              <MetricRow key={metric.key} metric={metric} current={data[metric.key]} values={data.values} />
            ))}
          </div>

          <p className="panel__note">{noBandNote(data)}</p>
        </>
      )}
    </section>
  )
}
