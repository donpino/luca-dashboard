import { describe, expect, it } from 'vitest'
import { buildDailyPayload, emptyFormState, MissingShinError, type DailyFormState } from './buildDailyPayload'

const validState: DailyFormState = {
  ...emptyFormState,
  shin: 1,
  illness: true,
  creatine: true,
  protein_breakfast: false,
  alcohol: false,
  late_meal: true,
  device_in_bed: false,
  cold_room: true,
  breathing_exercises: true,
  stretching: false,
  study_hours: 2.5,
  studyHoursTouched: true,
  journal: 'slept fine',
}

describe('buildDailyPayload', () => {
  it('blocks submission when shin is null', () => {
    const state: DailyFormState = { ...validState, shin: null }
    expect(() => buildDailyPayload(state, '2026-08-08')).toThrow(MissingShinError)
  })

  it('serialises untouched study_hours to null, even if a stray value is present', () => {
    const state: DailyFormState = { ...validState, study_hours: 4, studyHoursTouched: false }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.study_hours).toBeNull()
  })

  it('serialises a touched study_hours of 0 as 0, not null', () => {
    const state: DailyFormState = { ...validState, study_hours: 0, studyHoursTouched: true }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.study_hours).toBe(0)
  })

  it('serialises touched-then-cleared study_hours to null, not the leftover value', () => {
    // A clear handler that resets `touched` but forgets to reset `value`
    // must still serialise to null — buildDailyPayload has to gate on
    // studyHoursTouched, not on whether study_hours happens to be null.
    const state: DailyFormState = { ...validState, study_hours: 2.5, studyHoursTouched: false }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.study_hours).toBeNull()
  })

  it('serialises an empty journal to null', () => {
    const state: DailyFormState = { ...validState, journal: '' }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.journal).toBeNull()
  })

  it('serialises a whitespace-only journal to null', () => {
    const state: DailyFormState = { ...validState, journal: '   ' }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.journal).toBeNull()
  })

  it('trims a non-empty journal', () => {
    const state: DailyFormState = { ...validState, journal: '  hello  ' }
    const payload = buildDailyPayload(state, '2026-08-08')
    expect(payload.journal).toBe('hello')
  })

  it('emits all nine booleans as explicit booleans', () => {
    const payload = buildDailyPayload(validState, '2026-08-08')
    const booleanKeys: (keyof typeof payload)[] = [
      'illness',
      'creatine',
      'protein_breakfast',
      'alcohol',
      'late_meal',
      'device_in_bed',
      'cold_room',
      'breathing_exercises',
      'stretching',
    ]
    for (const key of booleanKeys) {
      expect(typeof payload[key]).toBe('boolean')
    }
  })

  it('passes the date through unmodified — never UTC-shifted', () => {
    const payload = buildDailyPayload(validState, '2026-01-05')
    expect(payload.date).toBe('2026-01-05')
  })

  it('never includes updated_at', () => {
    const payload = buildDailyPayload(validState, '2026-08-08')
    expect('updated_at' in payload).toBe(false)
  })
})
