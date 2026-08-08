import { describe, expect, it } from 'vitest'
import { addLocalDays, defaultLogDate, toLocalISODate, todayISODate } from './dateUtils'

describe('defaultLogDate', () => {
  it('defaults to yesterday just before the 04:00 cutover', () => {
    const now = new Date(2026, 7, 8, 3, 59, 59)
    expect(defaultLogDate(now)).toBe('2026-08-07')
  })

  it('defaults to today at exactly 04:00:00 — "before 04:00" is strict', () => {
    const now = new Date(2026, 7, 8, 4, 0, 0)
    expect(defaultLogDate(now)).toBe('2026-08-08')
  })

  it('defaults to today just after the 04:00 cutover', () => {
    const now = new Date(2026, 7, 8, 4, 1, 0)
    expect(defaultLogDate(now)).toBe('2026-08-08')
  })

  it('defaults to today well after the cutover', () => {
    const now = new Date(2026, 7, 8, 14, 30, 0)
    expect(defaultLogDate(now)).toBe('2026-08-08')
  })

  it('rolls back across a month boundary', () => {
    const now = new Date(2026, 8, 1, 0, 30, 0)
    expect(defaultLogDate(now)).toBe('2026-08-31')
  })
})

describe('toLocalISODate / todayISODate', () => {
  it('formats using local calendar fields, not UTC', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('todayISODate ignores the logging cutover entirely', () => {
    const now = new Date(2026, 7, 8, 2, 0, 0)
    expect(todayISODate(now)).toBe('2026-08-08')
  })
})

describe('addLocalDays', () => {
  it('steps back one calendar day', () => {
    expect(addLocalDays('2026-08-08', -1)).toBe('2026-08-07')
  })

  it('steps back across a month boundary', () => {
    expect(addLocalDays('2026-08-01', -1)).toBe('2026-07-31')
  })
})
