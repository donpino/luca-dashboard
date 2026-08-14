import { describe, expect, it } from 'vitest'
import {
  formatMinutes,
  formatMinutesRange,
  formatShortDate,
  formatUnit,
  formatUnitRange,
  noBandNote,
  stalenessNote,
} from './lastNightCopy'

describe('noBandNote', () => {
  it('names the FR70/Amazfit gap and the computed eligibility date, never an Amazfit number', () => {
    const text = noBandNote({ band_possible_from: '2026-08-28' })
    expect(text).toContain('2026-08-28')
    expect(text).toContain('Amazfit')
    expect(text).toContain('FR70')
    // Binding: the panel must not use the old Amazfit numbers (§8.1 v1.26).
    expect(text).not.toMatch(/4[1-8]|8[4-9]|9[0-9]|100/)
  })
})

describe('formatMinutes', () => {
  it('renders null distinctly from any real duration', () => {
    expect(formatMinutes(null)).toBe('—')
  })

  it('renders whole hours and minutes', () => {
    expect(formatMinutes(420)).toBe('7h 0m')
    expect(formatMinutes(395)).toBe('6h 35m')
  })
})

describe('formatUnit', () => {
  it('renders null as an em dash, not 0 or blank', () => {
    expect(formatUnit(null, ' bpm')).toBe('—')
  })

  it('appends the unit to a real value, including a real zero', () => {
    expect(formatUnit(46, ' bpm')).toBe('46 bpm')
    expect(formatUnit(0, ' bpm')).toBe('0 bpm')
  })
})

describe('formatMinutesRange', () => {
  it('states the unit once, at the end, not after each value', () => {
    expect(formatMinutesRange(391, 471)).toBe('6h 31m–7h 51m')
  })
})

describe('formatUnitRange', () => {
  it('states the unit once, at the end, not after each value', () => {
    expect(formatUnitRange(41, 44, ' bpm')).toBe('41–44 bpm')
  })
})

describe('formatShortDate', () => {
  it('drops the year, matching the shin panel axis-date convention', () => {
    expect(formatShortDate('2026-08-13')).toBe('08-13')
  })
})

describe('stalenessNote', () => {
  it('says nothing at the expected one-day clamp lag', () => {
    expect(stalenessNote(1)).toBeNull()
  })

  it('says nothing when the reading is from today', () => {
    expect(stalenessNote(0)).toBeNull()
  })

  it('names the gap plainly when more than one day behind', () => {
    expect(stalenessNote(3)).toBe('3 days behind today.')
  })

  it('carries no alarm language or adjective', () => {
    const text = stalenessNote(5)!
    expect(text.toLowerCase()).not.toMatch(/stale|old|warning|missed|alert/)
  })
})
