// §8.1 Panel 1 — "Most recent night" (retitled from "Last night" in the
// v1.30 amendment; see that amendment for why the old title was
// inaccurate from v1.26 onward). Presentational only: every value and
// every date comes straight from web/public/data/today.json's last_night
// field (compute/metrics.py's last_night(), CLAUDE.md rule 3) — this
// component formats and lays out, it does not compute. No band is drawn
// here — see noBandNote's docstring and DASHBOARD_SPEC.md's v1.26
// amendment for why.
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
//
// v1.30 amendment: ingest/sync.py's never-write-today clamp means the row
// shown here is never actually last night's — it is always at least one
// day old, and older still if a sync run was missed (§8.1 v1.30). The
// reading's date and, when the gap exceeds one day, a plain staleness
// line are rendered next to the values so a stale number never looks
// like this morning's.
//
// v1.31 amendment (fixing three v1.29 render defects): the box measures
// its own rendered width via ResizeObserver rather than stretching a
// fixed-aspect viewBox with `preserveAspectRatio="none"` — that distorted
// x roughly 3x more than y at typical widths, turning dot circles into
// ovals and squashing every slope. Building the viewBox from the box's
// *actual* pixel width each render keeps the x/y scale uniform at any
// viewport, phone included, without hardcoding a width that would only be
// correct at one screen size. The plot area is also inset from the
// viewBox edges (SPARK_INSET) so a point at the series extreme no longer
// sits on the boundary and gets its stroke or dot clipped in half, and
// the box is taller (SPARK_HEIGHT) so the shape reads at a glance. Hover
// is hand-rolled (no charting library — Today stays ECharts-free, v1.29)
// and finds the nearest point by pointer x-position the same way the
// Block panel's shin chart does (shinVolumeChart.ts's axis-triggered
// tooltip), rather than requiring a precise hit on a 2-3px dot.

import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'
import { formatMinutes, formatMinutesRange, formatShortDate, formatUnit, formatUnitRange, noBandNote, stalenessNote } from './lastNightCopy'
import { hasEnoughPointsForLine, nearestSparklineIndex, sparklineExtent, sparklinePoints, sparklineSegments } from './sparkline'
import type { LastNight, LastNightNight } from './today'

const SPARK_HEIGHT = 56
// Stroke width (matches .last-night__spark-line's CSS) plus dot radius —
// the minimum inset that keeps a point at the series extreme fully inside
// the viewBox rather than clipped on its edge (v1.31 fix b).
const SPARK_STROKE_WIDTH = 1.5
const SPARK_DOT_RADIUS = 2.5
const SPARK_INSET = SPARK_STROKE_WIDTH + SPARK_DOT_RADIUS

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

// Measures the wrapping div's own rendered width so the sparkline's
// viewBox can be built to that exact size (v1.31 fix a) — see the
// component-level comment for why a fixed-aspect viewBox can't be right
// at every screen width. `useLayoutEffect` (not `useEffect`) so the first
// paint already has a width instead of flashing an empty box.
function useMeasuredWidth(): [RefObject<HTMLDivElement>, number | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(w)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// Clamps the tooltip's horizontal anchor away from the box's own left/right
// edges so it doesn't render half off the panel when hovering a point near
// either end — a narrow phone card has little margin to spare.
function tooltipStyle(hoverPct: number): CSSProperties {
  const clamped = Math.min(92, Math.max(8, hoverPct))
  return { left: `${clamped}%`, transform: 'translateX(-50%)' }
}

function Sparkline({ nights, metric }: { nights: LastNightNight[]; metric: MetricConfig }) {
  const values = nights.map((night) => night[metric.key])
  const extent = sparklineExtent(values)
  const [containerRef, measuredWidth] = useMeasuredWidth()
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  if (extent === null) return null
  const segments = sparklineSegments(values)
  const width = measuredWidth ?? 0

  // Axis-triggered, like the Block panel's shin chart (shinVolumeChart.ts):
  // finds the nearest point by pointer x-position across the whole chart
  // width rather than requiring a precise hit on a 2-3px dot. A pointer
  // over a gap (nearest value is null) shows nothing — the line's own
  // break already says "no data here."
  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = containerRef.current
    if (!el || width === 0) return
    const rect = el.getBoundingClientRect()
    const localX = ((e.clientX - rect.left) / rect.width) * width
    const idx = nearestSparklineIndex(localX, width, SPARK_INSET, values.length)
    setHoveredIndex(values[idx] === null ? null : idx)
  }

  function handlePointerLeave() {
    setHoveredIndex(null)
  }

  let hoverX = 0
  if (hoveredIndex !== null) {
    const value = values[hoveredIndex] as number
    ;[hoverX] = sparklinePoints([{ index: hoveredIndex, value }], values.length, extent.min, extent.max, width, SPARK_HEIGHT, SPARK_INSET)
      .split(',')
      .map(Number)
  }
  const hoverPct = width > 0 ? (hoverX / width) * 100 : 0

  return (
    <div
      ref={containerRef}
      className="last-night__spark-wrap"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      {width > 0 && (
        <svg
          viewBox={`0 0 ${width} ${SPARK_HEIGHT}`}
          className="last-night__spark"
          role="img"
          aria-label={`${metric.label} shape over the current device era`}
        >
          {segments.map((segment) => (
            <g key={segment[0].index}>
              {segment.length > 1 && (
                <polyline
                  className="last-night__spark-line"
                  points={sparklinePoints(segment, values.length, extent.min, extent.max, width, SPARK_HEIGHT, SPARK_INSET)}
                />
              )}
              {segment.map((point) => {
                const [x, y] = sparklinePoints([point], values.length, extent.min, extent.max, width, SPARK_HEIGHT, SPARK_INSET)
                  .split(',')
                  .map(Number)
                const hovered = point.index === hoveredIndex
                return (
                  <circle
                    key={point.index}
                    className={hovered ? 'last-night__spark-dot last-night__spark-dot--hover' : 'last-night__spark-dot'}
                    cx={x}
                    cy={y}
                    r={hovered ? SPARK_DOT_RADIUS + 1 : SPARK_DOT_RADIUS}
                  />
                )
              })}
            </g>
          ))}
          {hoveredIndex !== null && (
            <line
              className="last-night__spark-guide"
              x1={hoverX}
              x2={hoverX}
              y1={SPARK_INSET}
              y2={SPARK_HEIGHT - SPARK_INSET}
            />
          )}
        </svg>
      )}
      {hoveredIndex !== null && (
        <div className="last-night__spark-tooltip mono" style={tooltipStyle(hoverPct)}>
          <strong>{formatShortDate(nights[hoveredIndex].date)}</strong>
          <span>{metric.formatValue(values[hoveredIndex])}</span>
        </div>
      )}
    </div>
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
          <Sparkline nights={values} metric={metric} />
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
  const staleness = data === null ? null : stalenessNote(data.days_behind)
  return (
    <section className="panel" aria-label="Most recent night">
      <h2 className="panel__title">Most recent night</h2>
      {data === null ? (
        <p className="status-text status-text--muted">No biometrics recorded yet.</p>
      ) : (
        <>
          <p className="mono panel__subtitle">
            {formatShortDate(data.date)}
            {staleness && ` · ${staleness}`}
          </p>

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
