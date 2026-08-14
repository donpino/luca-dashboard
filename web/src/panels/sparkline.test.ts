import { describe, expect, it } from 'vitest'
import {
  hasEnoughPointsForLine,
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
})
