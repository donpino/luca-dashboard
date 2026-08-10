import { describe, expect, it } from 'vitest'
import { buildShinVolumeOption, coverageText, minimumDataNote } from './shinVolumeChart'
import type { ShinSeriesDay, ShinSeriesResponse } from './shinSeries'

function day(overrides: Partial<ShinSeriesDay>): ShinSeriesDay {
  return {
    date: '2026-08-08',
    shin: null,
    rolling_7d_km: 0,
    band: 'not_answered',
    understated_volume: false,
    ...overrides,
  }
}

function response(series: ShinSeriesDay[]): ShinSeriesResponse {
  const answered = series.filter((d) => d.shin !== null).length
  return { series, coverage: { answered, total: series.length } }
}

describe('coverageText', () => {
  it('renders "n answered / n days in range" from the JSON counts, per §7', () => {
    expect(coverageText({ answered: 2, total: 3 })).toBe('2 answered / 3 days in range')
  })

  it('never recomputes coverage — reads the numbers as given, even if inconsistent', () => {
    expect(coverageText({ answered: 0, total: 0 })).toBe('0 answered / 0 days in range')
  })
})

describe('minimumDataNote', () => {
  it('is absent once the range covers a full rolling window', () => {
    expect(minimumDataNote({ answered: 2, total: 7 })).toBeNull()
    expect(minimumDataNote({ answered: 2, total: 30 })).toBeNull()
  })

  it('appears below one rolling window, without implying a trend', () => {
    expect(minimumDataNote({ answered: 2, total: 2 })).toBe(
      'early days — range is shorter than one rolling 7-day window (2 days)',
    )
  })

  it('singularises "day" at n=1', () => {
    expect(minimumDataNote({ answered: 1, total: 1 })).toContain('(1 day)')
  })
})

describe('buildShinVolumeOption — shin marker states (§10, three states without colour)', () => {
  const data = response([
    day({ date: '2026-08-08', shin: 0, band: 'in_band' }),
    day({ date: '2026-08-09', shin: 2, band: 'out_of_band' }),
    day({ date: '2026-08-10', shin: null, band: 'not_answered' }),
  ])
  const option = buildShinVolumeOption(data)
  const shinSeries = option.series as Array<Record<string, unknown>>
  const shinLine = shinSeries.find((s) => s.id === 'shin')!
  const notAnswered = shinSeries.find((s) => s.id === 'shin-not-answered')!

  it('renders in_band (shin=0) as a solid (filled) marker', () => {
    const points = shinLine.data as Array<{ value: number; itemStyle: Record<string, unknown> } | null>
    expect(points[0]?.value).toBe(0)
    expect(points[0]?.itemStyle.color).not.toBe('transparent')
  })

  it('renders out_of_band as a hollow (unfilled) marker at its real ordinal height', () => {
    const points = shinLine.data as Array<{ value: number; itemStyle: Record<string, unknown> } | null>
    expect(points[1]?.value).toBe(2) // raw ordinal still drives step height, §7
    expect(points[1]?.itemStyle.color).toBe('transparent')
    expect(points[1]?.itemStyle.borderColor).toBeTruthy()
  })

  it('leaves a gap in the shin step series for not_answered — never a value, never zero', () => {
    const points = shinLine.data as unknown[]
    expect(points[2]).toBeNull()
    expect((shinLine as { connectNulls: boolean }).connectNulls).toBe(false)
  })

  it('draws not_answered as its own series, sitting on the axis, hairline and unfilled', () => {
    const points = notAnswered.data as Array<number | null>
    expect(points).toEqual([null, null, 0])
    const style = notAnswered.itemStyle as Record<string, unknown>
    expect(style.color).toBe('transparent')
    expect(style.borderWidth).toBe(1) // hairline, thinner than the out_of_band stroke (2)
  })

  it('a solid in-band 0 and an absent not_answered 0 use different fill state, never look the same', () => {
    const shinPoints = shinLine.data as Array<{ itemStyle: Record<string, unknown> } | null>
    const notAnsweredStyle = notAnswered.itemStyle as Record<string, unknown>
    expect(shinPoints[0]?.itemStyle.color).not.toBe(notAnsweredStyle.color)
  })
})

describe('buildShinVolumeOption — rolling_7d_km line', () => {
  it('always plots a value, never a gap — rolling_7d_km is never null (§7)', () => {
    const data = response([
      day({ date: '2026-08-08', rolling_7d_km: 12.4 }),
      day({ date: '2026-08-09', rolling_7d_km: 15.0 }),
    ])
    const option = buildShinVolumeOption(data)
    const km = (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'rolling-7d-km')!
    expect(km.data).toEqual([12.4, 15.0])
  })
})

describe('buildShinVolumeOption — understated-volume treatment (§8.3 v1.7, binding)', () => {
  it('only fills the hatched area where understated_volume is true, reading the flag as-is', () => {
    const data = response([
      day({ date: '2026-08-06', rolling_7d_km: 10, understated_volume: true }),
      day({ date: '2026-08-07', rolling_7d_km: 11, understated_volume: true }),
      day({ date: '2026-08-08', rolling_7d_km: 12, understated_volume: false }),
    ])
    const option = buildShinVolumeOption(data)
    const hatch = (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'understated-volume')!
    expect(hatch.data).toEqual([10, 11, null])
    const areaStyle = hatch.areaStyle as Record<string, unknown>
    const color = areaStyle.color as Record<string, unknown>
    expect(color.image).toContain('svg')
  })

  it('never hardcodes the cutoff date — a flag flipped in the fixture flips the render', () => {
    const flippedEarly = response([day({ date: '2026-08-06', rolling_7d_km: 10, understated_volume: false })])
    const option = buildShinVolumeOption(flippedEarly)
    const hatch = (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'understated-volume')!
    expect(hatch.data).toEqual([null])
  })
})

describe('buildShinVolumeOption — prefers-reduced-motion (§9 quality floor)', () => {
  it('disables animation when the caller reports reduced motion', () => {
    const data = response([day({ date: '2026-08-08' })])
    expect(buildShinVolumeOption(data, { reducedMotion: true }).animation).toBe(false)
    expect(buildShinVolumeOption(data, { reducedMotion: false }).animation).toBe(true)
  })
})
