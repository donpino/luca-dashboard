import { describe, expect, it } from 'vitest'
import {
  hasEnoughPointsForLine,
  nearestSparklineIndex,
  sparklineExtent,
  sparklinePoints,
  sparklineSegments,
} from './sparkline'

describe('sparklineExtent', () => {
  it('ignores nulls when finding min/max', () => {
    expect(sparklineExtent([41, null, 44, 43, null])).toEqual({ min: 41, max: 44 })
  })

  it('returns null when every value is null — no shape to draw', () => {
    expect(sparklineExtent([null, null])).toBeNull()
  })

  it('returns a min equal to max for a flat series, not a crash', () => {
    expect(sparklineExtent([50, 50])).toEqual({ min: 50, max: 50 })
  })
})

describe('sparklineSegments', () => {
  it('keeps one contiguous run as a single segment when there are no gaps', () => {
    const segments = sparklineSegments([81, 79, 93])
    expect(segments).toEqual([
      [
        { index: 0, value: 81 },
        { index: 1, value: 79 },
        { index: 2, value: 93 },
      ],
    ])
  })

  it('breaks the line at a null instead of bridging across it', () => {
    const segments = sparklineSegments([81, null, 93, 74])
    expect(segments).toEqual([
      [{ index: 0, value: 81 }],
      [
        { index: 2, value: 93 },
        { index: 3, value: 74 },
      ],
    ])
  })

  it('drops leading and trailing nulls without emitting empty segments', () => {
    const segments = sparklineSegments([null, 81, 79, null])
    expect(segments).toEqual([
      [
        { index: 1, value: 81 },
        { index: 2, value: 79 },
      ],
    ])
  })

  it('returns no segments when every value is null', () => {
    expect(sparklineSegments([null, null])).toEqual([])
  })
})

describe('hasEnoughPointsForLine', () => {
  it('is false below three non-null points — a line through two points is a slope', () => {
    expect(hasEnoughPointsForLine([81, null])).toBe(false)
    expect(hasEnoughPointsForLine([81, 79])).toBe(false)
  })

  it('is true at exactly three non-null points', () => {
    expect(hasEnoughPointsForLine([81, 79, 93])).toBe(true)
  })

  it('counts only non-null points toward the threshold', () => {
    expect(hasEnoughPointsForLine([81, null, null, 79, 93])).toBe(true)
  })
})

describe('sparklinePoints', () => {
  it('positions points by index in the full series, so a gap keeps its width', () => {
    const segment = [
      { index: 0, value: 40 },
      { index: 2, value: 60 },
    ]
    const points = sparklinePoints(segment, 3, 40, 60, 100, 10)
    expect(points).toBe('0.00,10.00 100.00,0.00')
  })

  it('renders a flat series as a horizontal midline, not a division by zero', () => {
    const segment = [
      { index: 0, value: 50 },
      { index: 1, value: 50 },
    ]
    expect(sparklinePoints(segment, 2, 50, 50, 100, 10)).toBe('0.00,5.00 100.00,5.00')
  })

  // v1.31: binding rule "inset the plot area by at least the stroke width
  // plus the dot radius" — a point at the series extreme must land inside
  // the viewBox, not on its edge, or the stroke/dot clips in half.
  it('insets extreme points away from the viewBox edges instead of on them', () => {
    const segment = [
      { index: 0, value: 40 },
      { index: 2, value: 60 },
    ]
    // width 108 x height 16, inset 4 -> plot area is [4,104] x [4,12], not
    // [0,108] x [0,16]. min (40) sits at the plot area's bottom (y=12),
    // max (60) at its top (y=4) — never on the outer viewBox edge.
    expect(sparklinePoints(segment, 3, 40, 60, 108, 16, 4)).toBe('4.00,12.00 104.00,4.00')
  })

  it('keeps a flat series midline correct with a non-zero inset', () => {
    const segment = [
      { index: 0, value: 50 },
      { index: 1, value: 50 },
    ]
    // plotHeight = 10 - 2*3 = 4, midline = 3 + 4/2 = 5.
    expect(sparklinePoints(segment, 2, 50, 50, 108, 10, 3)).toBe('3.00,5.00 105.00,5.00')
  })
})

describe('nearestSparklineIndex', () => {
  it('finds the nearest index with no inset', () => {
    expect(nearestSparklineIndex(0, 100, 0, 3)).toBe(0)
    expect(nearestSparklineIndex(50, 100, 0, 3)).toBe(1)
    expect(nearestSparklineIndex(100, 100, 0, 3)).toBe(2)
  })

  it('clamps out-of-range pointer positions to the nearest valid index', () => {
    expect(nearestSparklineIndex(-40, 100, 0, 3)).toBe(0)
    expect(nearestSparklineIndex(500, 100, 0, 3)).toBe(2)
  })

  it('accounts for inset when mapping a pointer position to an index', () => {
    // plot area [4, 104] over 3 points -> point 0 at x=4, point 2 at x=104.
    expect(nearestSparklineIndex(4, 108, 4, 3)).toBe(0)
    expect(nearestSparklineIndex(54, 108, 4, 3)).toBe(1)
    expect(nearestSparklineIndex(104, 108, 4, 3)).toBe(2)
  })

  it('always returns 0 for a single-point series', () => {
    expect(nearestSparklineIndex(75, 100, 0, 1)).toBe(0)
  })
})
