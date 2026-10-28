import { describe, expect, it } from 'vitest'
import { fmtClock, fmtDay, fmtDelta, fmtInput, fmtMinutes, fmtPct, fmtScore, fmtStrain } from './scoresCopy'

describe('scoresCopy', () => {
  it('formats a day without a time zone shift', () => {
    expect(fmtDay('2026-10-27')).toBe('27 Oct')
    expect(fmtDay('2026-08-08T00:57:13')).toBe('8 Aug')
  })

  it('renders null as an em dash, never 0', () => {
    expect(fmtScore(null)).toBe('—')
    expect(fmtStrain(undefined)).toBe('—')
    expect(fmtMinutes(null)).toBe('—')
    expect(fmtPct(null)).toBe('—')
    expect(fmtInput('hrv', null)).toBe('—')
  })

  it('rounds for display only', () => {
    expect(fmtScore(57.93)).toBe('58')
    expect(fmtStrain(11.849)).toBe('11.8')
    expect(fmtMinutes(444)).toBe('7h 24m')
    expect(fmtMinutes(31)).toBe('31m')
    expect(fmtPct(0.9104)).toBe('91%')
    expect(fmtInput('respiration', 14.23)).toBe('14.2 rpm')
  })

  it('formats the per-range delta with direction', () => {
    expect(fmtDelta(1.26)).toBe('↗ +1.3')
    expect(fmtDelta(-0.44)).toBe('↘ −0.4')
    expect(fmtDelta(0.01)).toBe('→ 0')
    expect(fmtDelta(null)).toBeNull()
  })

  it('reads the wall clock straight off the local timestamp', () => {
    expect(fmtClock('2026-10-27T23:41:00')).toBe('23:41')
    expect(fmtClock(null)).toBe('—')
  })
})
