import { describe, expect, it } from 'vitest'
import { buildShinVolumeOption, coverageText, minimumDataNote } from './shinVolumeChart'
import type { ShinSeriesDay } from './shinSeries'

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
  const series = [
    day({ date: '2026-08-08', shin: 0, band: 'in_band' }),
    day({ date: '2026-08-09', shin: 2, band: 'out_of_band' }),
    day({ date: '2026-08-10', shin: null, band: 'not_answered' }),
  ]
  const option = buildShinVolumeOption(series)
  const optionSeries = option.series as Array<Record<string, unknown>>
  const shinLine = optionSeries.find((s) => s.id === 'shin')!
  const notAnswered = optionSeries.find((s) => s.id === 'shin-not-answered')!

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
    const series = [
      day({ date: '2026-08-08', rolling_7d_km: 12.4 }),
      day({ date: '2026-08-09', rolling_7d_km: 15.0 }),
    ]
    const option = buildShinVolumeOption(series)
    const km = (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'rolling-7d-km')!
    expect(km.data).toEqual([12.4, 15.0])
  })
})

describe('buildShinVolumeOption — understated-volume treatment (§8.3 v1.7/v1.22, binding)', () => {
  type MarkAreaSeries = { markArea: { data: unknown[]; itemStyle: { color: Record<string, unknown> } }; z: number }

  it('spans a markArea from the first to the last understated_volume day, reading the flag as-is', () => {
    const series = [
      day({ date: '2026-08-06', rolling_7d_km: 10, understated_volume: true }),
      day({ date: '2026-08-07', rolling_7d_km: 11, understated_volume: true }),
      day({ date: '2026-08-08', rolling_7d_km: 12, understated_volume: false }),
    ]
    const option = buildShinVolumeOption(series)
    const region = (option.series as Array<Record<string, unknown>>).find(
      (s) => s.id === 'understated-volume',
    ) as unknown as MarkAreaSeries
    expect(region.markArea.data).toEqual([[{ xAxis: '2026-08-06' }, { xAxis: '2026-08-08' }]])
    expect(region.markArea.itemStyle.color.image).toContain('svg')
  })

  it('never hardcodes the cutoff date — a flag flipped in the fixture flips the render', () => {
    const flippedEarly = [day({ date: '2026-08-06', rolling_7d_km: 10, understated_volume: false })]
    const option = buildShinVolumeOption(flippedEarly)
    const region = (option.series as Array<Record<string, unknown>>).find(
      (s) => s.id === 'understated-volume',
    ) as unknown as MarkAreaSeries
    expect(region.markArea.data).toEqual([])
  })

  it('emits no region when the visible range never touches understated volume', () => {
    const series = [
      day({ date: '2026-08-08', understated_volume: false }),
      day({ date: '2026-08-09', understated_volume: false }),
    ]
    const option = buildShinVolumeOption(series)
    const region = (option.series as Array<Record<string, unknown>>).find(
      (s) => s.id === 'understated-volume',
    ) as unknown as MarkAreaSeries
    expect(region.markArea.data).toEqual([])
  })

  it('is the lowest-z series so it renders behind both the km line and the shin markers', () => {
    const series = [day({ date: '2026-08-06', understated_volume: true })]
    const option = buildShinVolumeOption(series)
    const byId = (id: string) =>
      (option.series as Array<Record<string, unknown>>).find((s) => s.id === id) as unknown as { z: number }
    const region = byId('understated-volume')
    const km = byId('rolling-7d-km')
    const shin = byId('shin')
    expect(region.z).toBeLessThan(km.z)
    expect(region.z).toBeLessThan(shin.z)
  })

  it('is silent and unanimated, so it never intercepts hover or animates in', () => {
    const series = [day({ date: '2026-08-06', understated_volume: true })]
    const option = buildShinVolumeOption(series)
    const region = (option.series as Array<Record<string, unknown>>).find(
      (s) => s.id === 'understated-volume',
    ) as unknown as { markArea: { silent: boolean; animation: boolean } }
    expect(region.markArea.silent).toBe(true)
    expect(region.markArea.animation).toBe(false)
  })
})

describe('buildShinVolumeOption — x-axis date labels across a wide range', () => {
  it('omits the year when the plotted range stays within one calendar year', () => {
    const series = [day({ date: '2026-05-01' }), day({ date: '2026-08-10' })]
    const option = buildShinVolumeOption(series)
    const xAxis = option.xAxis as { axisLabel: { formatter: (iso: string) => string } }
    expect(xAxis.axisLabel.formatter('2026-05-01')).toBe('05-01')
  })

  it('includes the year once the range crosses a calendar year boundary (§9 "6m"/"1y"/"all")', () => {
    const series = [day({ date: '2023-05-13' }), day({ date: '2026-08-10' })]
    const option = buildShinVolumeOption(series)
    const xAxis = option.xAxis as { axisLabel: { formatter: (iso: string) => string } }
    expect(xAxis.axisLabel.formatter('2023-05-13')).toBe('23-05-13')
  })
})

describe('buildShinVolumeOption — prefers-reduced-motion (§9 quality floor)', () => {
  it('disables animation when the caller reports reduced motion', () => {
    const series = [day({ date: '2026-08-08' })]
    expect(buildShinVolumeOption(series, { reducedMotion: true }).animation).toBe(false)
    expect(buildShinVolumeOption(series, { reducedMotion: false }).animation).toBe(true)
  })
})

describe('buildShinVolumeOption — axis-triggered hover tooltip (§9 on-demand inspection)', () => {
  const series = [
    day({ date: '2026-08-08', shin: 0, rolling_7d_km: 12.4, understated_volume: false }),
    day({ date: '2026-08-09', shin: null, rolling_7d_km: 13.0, understated_volume: false }),
    day({ date: '2026-08-06', shin: 2, rolling_7d_km: 9.8, understated_volume: true }),
  ]
  const option = buildShinVolumeOption(series)
  const tooltip = option.tooltip as { trigger: string; formatter: (params: unknown) => string }

  it('is axis-triggered, not item-triggered', () => {
    expect(tooltip.trigger).toBe('axis')
  })

  it('shows the raw 0-3 shin value when answered, never blank, never a bare 0 rendered as nothing', () => {
    const html = tooltip.formatter([{ dataIndex: 0 }])
    expect(html).toContain('2026-08-08')
    expect(html).toContain('shin: 0')
    expect(html).toContain('12.4')
  })

  it('shows an explicit "not answered" when shin is null — never blank, never 0 (§5, CLAUDE.md rule 12)', () => {
    const html = tooltip.formatter([{ dataIndex: 1 }])
    expect(html).toContain('not answered')
    expect(html).not.toMatch(/shin: 0(?!\S)/)
  })

  it('flags understated volume on days the flag is true', () => {
    const html = tooltip.formatter([{ dataIndex: 2 }])
    expect(html).toContain('volume floor')
  })

  it('does not flag understated volume when the flag is false', () => {
    const html = tooltip.formatter([{ dataIndex: 0 }])
    expect(html).not.toContain('volume floor')
  })
})

describe('buildShinVolumeOption — not-answered marker density (crowding fix, v1.18)', () => {
  function notAnsweredSeries(pointCount: number) {
    const series = Array.from({ length: pointCount }, (_, i) => day({ date: `day-${i}` }))
    const option = buildShinVolumeOption(series)
    return (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'shin-not-answered')!
  }

  it('keeps the not-answered ring at full size/opacity within about two legible weeks (<=14 points)', () => {
    const notAnswered = notAnsweredSeries(14)
    expect(notAnswered.symbolSize).toBe(7)
    expect((notAnswered.itemStyle as Record<string, unknown>).opacity).toBe(1)
  })

  it('is already visibly shrunk at the reported crowding case — 90 points, most unanswered', () => {
    // The reported fault: 88 hairline rings at 90 days swamping 2 real
    // readings. This range must not still render at full size/opacity.
    const notAnswered = notAnsweredSeries(90)
    const size = notAnswered.symbolSize as number
    const opacity = (notAnswered.itemStyle as Record<string, unknown>).opacity as number
    expect(size).toBeLessThan(4)
    expect(opacity).toBeLessThan(0.5)
  })

  it('shrinks further at a wide "all" range, but never to zero', () => {
    const notAnswered = notAnsweredSeries(1000)
    const size = notAnswered.symbolSize as number
    const opacity = (notAnswered.itemStyle as Record<string, unknown>).opacity as number
    expect(size).toBeGreaterThan(0)
    expect(opacity).toBeGreaterThan(0)
    expect(size).toBeLessThan(notAnsweredSeries(90).symbolSize as number)
  })

  it('leaves the answered shin markers at their fixed size regardless of density', () => {
    const wide = Array.from({ length: 1000 }, (_, i) => day({ date: `day-${i}` }))
    const option = buildShinVolumeOption(wide)
    const shinLine = (option.series as Array<Record<string, unknown>>).find((s) => s.id === 'shin')!
    expect(shinLine.symbolSize).toBe(9)
  })
})
