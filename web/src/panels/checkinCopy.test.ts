import { describe, expect, it } from 'vitest'
import {
  checkinText,
  complianceLines,
  dataQualityLine,
  rampLine,
  volumeLine,
  weekHeaderLine,
} from './checkinCopy'
import type { WeekResponse } from './week'

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
      { date: '2026-08-15', session_type: null, done: null },
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

describe('weekHeaderLine', () => {
  it('uses weekly.week and dates_label when a weekly row exists', () => {
    expect(weekHeaderLine(baseWeek())).toBe('Week 4 (Aug 10-16)')
  })

  it('falls back to the ISO date range when no weekly row exists', () => {
    const data = baseWeek({ week_label: null, dates_label: null })
    expect(weekHeaderLine(data)).toBe('2026-08-10 to 2026-08-16')
  })
})

describe('volumeLine', () => {
  it('reads actual and planned km as given', () => {
    expect(volumeLine(baseWeek())).toBe('**Volume:** 30.2 km actual vs 32.0 km planned')
  })

  it('says planned is unknown, never 0, when planned_km is null', () => {
    const text = volumeLine(baseWeek({ planned_km: null }))
    expect(text).toContain('planned unknown')
    expect(text).not.toMatch(/vs 0/)
  })
})

describe('rampLine', () => {
  it('formats a positive ramp with a sign and both totals', () => {
    expect(rampLine(baseWeek())).toBe('**Ramp:** +8% (30.2 km vs 28.0 km previous week)')
  })

  it('formats a negative ramp without a double sign', () => {
    const text = rampLine(baseWeek({ ramp_pct: -0.1 }))
    expect(text).toContain('-10%')
    expect(text).not.toContain('+-')
  })

  it('states unknown, not 0%, when ramp_pct is null', () => {
    const text = rampLine(baseWeek({ ramp_pct: null }))
    expect(text).toBe('**Ramp:** unknown — no previous-week volume to compare')
  })
})

describe('complianceLines', () => {
  it('renders one line per day with session type and done', () => {
    const lines = complianceLines(baseWeek())
    expect(lines).toHaveLength(7)
    expect(lines[0]).toBe('- Mon 2026-08-10 — Easy Run: Yes')
  })

  it('says a date has no session logged rather than omitting it', () => {
    const lines = complianceLines(baseWeek())
    expect(lines[1]).toBe('- Tue 2026-08-11 — no session logged')
  })
})

describe('dataQualityLine', () => {
  it('is absent when the week is fully clean', () => {
    expect(dataQualityLine(baseWeek({ understated_volume: false }))).toBeNull()
  })

  it('states the floor and unreliable-ramp caveat, reading the cutoff from data', () => {
    const text = dataQualityLine(
      baseWeek({ understated_volume: true, understated_volume_cutoff: '2026-08-08' }),
    )
    expect(text).not.toBeNull()
    expect(text).toContain('2026-08-08')
    expect(text).toContain('floor')
    expect(text).toContain('not a reliable comparison')
  })
})

describe('checkinText', () => {
  it('carries no verdict or composite language', () => {
    const text = checkinText(baseWeek())
    expect(text.toLowerCase()).not.toMatch(/score|verdict|good|bad|great|poor/)
  })

  it('contains no emoji', () => {
    const text = checkinText(baseWeek())
    // eslint-disable-next-line no-control-regex
    expect(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text)).toBe(false)
  })

  it('uses only lightweight markdown: one heading, bold field labels, bullets', () => {
    const text = checkinText(baseWeek())
    const headingLines = text.split('\n').filter((line) => line.startsWith('# '))
    expect(headingLines).toHaveLength(1)
    expect(text).not.toContain('|') // no tables
  })

  it('appends the data-quality note only when the flag is set', () => {
    const clean = checkinText(baseWeek({ understated_volume: false }))
    expect(clean).not.toContain('**Note:**')

    const flagged = checkinText(baseWeek({ understated_volume: true }))
    expect(flagged).toContain('**Note:**')
  })
})
