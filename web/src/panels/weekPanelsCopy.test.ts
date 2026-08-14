import { describe, expect, it } from 'vitest'
import {
  actualKmText,
  complianceLabel,
  complianceState,
  hrvMeanText,
  nightCountText,
  plannedKmText,
  rampDetailText,
  rampPctText,
  rhrMeanText,
  shinCoverageText,
  shinMaxText,
  sleepMeanText,
  understatedVolumeNote,
  weekdayLabel,
} from './weekPanelsCopy'
import type { WeekResponse, WeekSessionDay, WeekWellness } from './week'

function baseWeek(overrides: Partial<WeekResponse> = {}): WeekResponse {
  return {
    week_start: '2026-08-10',
    week_end: '2026-08-16',
    week_label: 'Week 4',
    dates_label: 'Aug 10-16',
    actual_km: 30.2,
    planned_km: 32.0,
    prev_actual_km: 28.0,
    ramp_pct: 0.0786,
    sessions: [
      { date: '2026-08-10', session_type: 'Easy Run', done: 'Yes' },
      { date: '2026-08-11', session_type: null, done: null },
      { date: '2026-08-12', session_type: 'Medio', done: 'Partial' },
      { date: '2026-08-13', session_type: 'Rest / Check-in', done: 'Yes' },
      { date: '2026-08-14', session_type: 'Easy Run', done: 'Pending' },
      { date: '2026-08-15', session_type: 'Rest', done: 'No' },
      { date: '2026-08-16', session_type: 'Long Run', done: 'Pending' },
    ],
    wellness: {
      sleep_mean_min: 410.5,
      sleep_n: 5,
      rhr_mean: 45.2,
      rhr_n: 6,
      hrv_mean: 50.1,
      hrv_n: 4,
      shin_max: 1,
      shin_answered: 5,
    },
    understated_volume: false,
    understated_volume_cutoff: '2026-08-08',
    ...overrides,
  }
}

function baseWellness(overrides: Partial<WeekWellness> = {}): WeekWellness {
  return { ...baseWeek().wellness, ...overrides }
}

describe('weekdayLabel', () => {
  it('returns Monday-first labels', () => {
    expect(weekdayLabel(0)).toBe('Mon')
    expect(weekdayLabel(6)).toBe('Sun')
  })
})

describe('actualKmText / plannedKmText', () => {
  it('formats actual km', () => {
    expect(actualKmText(baseWeek())).toBe('30.2 km')
  })

  it('says planned is unknown, never 0, when no weekly row exists', () => {
    const text = plannedKmText(baseWeek({ planned_km: null }))
    expect(text).toContain('unknown')
    expect(text).not.toMatch(/^0/)
  })

  it('formats a known planned km', () => {
    expect(plannedKmText(baseWeek())).toBe('32.0 km')
  })
})

describe('rampPctText / rampDetailText', () => {
  it('formats a known ramp with sign', () => {
    expect(rampPctText(baseWeek())).toBe('+8%')
  })

  it('states unknown, never 0%, when ramp_pct is null', () => {
    expect(rampPctText(baseWeek({ ramp_pct: null }))).toBe('unknown')
  })

  it('detail text explains a null ramp instead of comparing km', () => {
    const text = rampDetailText(baseWeek({ ramp_pct: null }))
    expect(text).toContain('No previous-week volume')
    expect(text).not.toContain('km')
  })

  it('detail text compares both weeks when ramp is known', () => {
    expect(rampDetailText(baseWeek())).toBe('30.2 km vs 28.0 km previous week')
  })
})

describe('understatedVolumeNote', () => {
  it('carries the same floor/unreliable-ramp substance as the check-in caveat', () => {
    const text = understatedVolumeNote(baseWeek({ understated_volume_cutoff: '2026-08-08' }))
    expect(text).toContain('2026-08-08')
    expect(text).toContain('floor')
    expect(text).toContain('not a reliable comparison')
  })
})

describe('complianceState / complianceLabel', () => {
  const cases: Array<[WeekSessionDay['done'], string]> = [
    ['Yes', 'yes'],
    ['Partial', 'partial'],
    ['No', 'no'],
    ['Pending', 'pending'],
  ]

  it.each(cases)('maps done=%s to state %s', (done, expected) => {
    expect(complianceState({ done })).toBe(expected)
  })

  it('treats a day with no sessions row as its own state, not "no"', () => {
    expect(complianceState({ done: null })).toBe('no-row')
    expect(complianceState({ done: null })).not.toBe('no')
  })

  it('gives the no-row state a distinct label from the No state', () => {
    expect(complianceLabel('no-row')).not.toBe(complianceLabel('no'))
    expect(complianceLabel('no-row')).toBe('No plan')
    expect(complianceLabel('no')).toBe('No')
  })
})

describe('wellness text helpers', () => {
  it('states no data, never 0, when a mean is null', () => {
    expect(sleepMeanText(baseWellness({ sleep_mean_min: null }))).toBe('no data')
    expect(rhrMeanText(baseWellness({ rhr_mean: null }))).toBe('no data')
    expect(hrvMeanText(baseWellness({ hrv_mean: null }))).toBe('no data')
  })

  it('formats known means with rounded units', () => {
    expect(sleepMeanText(baseWellness())).toBe('6h 51m avg')
    expect(rhrMeanText(baseWellness())).toBe('45 bpm avg')
    expect(hrvMeanText(baseWellness())).toBe('50 ms avg')
  })

  it('carries the night count separately so a partial mean is never mistaken for a full week', () => {
    expect(nightCountText(3)).toBe('3/7 nights')
    expect(nightCountText(7)).toBe('7/7 nights')
  })

  it('states no data, never 0, when shin_max is null (nothing answered)', () => {
    expect(shinMaxText(baseWellness({ shin_max: null }))).toBe('no data')
  })

  it('formats a known shin_max with its coverage', () => {
    expect(shinMaxText(baseWellness())).toBe('max 1')
    expect(shinCoverageText(baseWellness())).toBe('5/7 answered')
  })
})
