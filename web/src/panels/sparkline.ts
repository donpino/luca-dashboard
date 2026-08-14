// Pure geometry/selection helpers for the §8.1 Panel 1 sparklines (v1.29
// amendment). No charting library (CLAUDE.md build note: Today stays
// ECharts-free, §4) — these functions turn a `LastNightNight[]` field into
// SVG polyline coordinates. They never fetch, aggregate, or judge; every
// value they touch already came out of compute/metrics.py's last_night()
// (CLAUDE.md rule 3).

export interface SparklinePoint {
  index: number
  value: number
}

// Extent ignoring nulls (CLAUDE.md rule 12: a null reading is not zero, so
// it must not pull min/max toward the floor). `null` means no non-null
// value exists at all — nothing to draw a shape from.
export function sparklineExtent(values: (number | null)[]): { min: number; max: number } | null {
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length === 0) return null
  return { min: Math.min(...nums), max: Math.max(...nums) }
}

// §8.1 v1.29 binding rule 5: a null value breaks the line — it does not
// drop to the floor and it does not get bridged. Splits the series into
// contiguous runs of non-null points; each run is drawn as its own
// polyline, so the gap between runs renders as a visual break, not a slope
// through a missing night.
export function sparklineSegments(values: (number | null)[]): SparklinePoint[][] {
  const segments: SparklinePoint[][] = []
  let current: SparklinePoint[] = []
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 0) {
        segments.push(current)
        current = []
      }
      return
    }
    current.push({ index, value })
  })
  if (current.length > 0) segments.push(current)
  return segments
}

// §8.1 v1.29 binding rule 6: two points drawn as a line is a slope, and a
// slope is a trend claim §3.1 forbids on a new-device sample this small.
// Below three non-null points, the caller renders text, not a line.
export function hasEnoughPointsForLine(values: (number | null)[]): boolean {
  return values.filter((v) => v !== null).length >= 3
}

// Scales one segment into an SVG `points` attribute string inside a
// width x height box, positioning each point by its index in the *full*
// series (so a gap keeps its width) rather than its position within the
// segment. A flat series (min === max) renders as a horizontal midline
// instead of dividing by zero.
export function sparklinePoints(
  segment: SparklinePoint[],
  totalPoints: number,
  min: number,
  max: number,
  width: number,
  height: number,
): string {
  const range = max - min
  return segment
    .map(({ index, value }) => {
      const x = totalPoints > 1 ? (index / (totalPoints - 1)) * width : width / 2
      const y = range === 0 ? height / 2 : height - ((value - min) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
