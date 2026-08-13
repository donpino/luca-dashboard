import { describe, expect, it } from 'vitest'
import { flagLabel, flagText } from './flagCopy'
import type { IllnessFlag, ShinFlag, VolumeRampFlag } from './today'

describe('shin flag', () => {
  const flag: ShinFlag = { kind: 'shin', date: '2026-08-13', shin: 2 }

  it('labels as Shin', () => {
    expect(flagLabel(flag)).toBe('Shin')
  })

  it('states the value and the date', () => {
    expect(flagText(flag)).toBe('Shin 2 reported on 2026-08-13.')
  })
})

describe('illness flag', () => {
  const flag: IllnessFlag = { kind: 'illness', date: '2026-08-12' }

  it('labels as Illness', () => {
    expect(flagLabel(flag)).toBe('Illness')
  })

  it('states the date', () => {
    expect(flagText(flag)).toBe('Illness reported on 2026-08-12.')
  })
})

describe('volume ramp flag', () => {
  const flag: VolumeRampFlag = {
    kind: 'volume_ramp',
    window_end: '2026-08-12',
    current_7d_km: 25.0,
    prev_7d_km: 20.0,
    pct: 0.25,
  }

  it('labels as Volume ramp', () => {
    expect(flagLabel(flag)).toBe('Volume ramp')
  })

  it('shows both totals and the percentage, reading the numbers as given', () => {
    expect(flagText(flag)).toBe(
      'Rolling 7-day km up 25% — 25.0 km vs 20.0 km (7 days ending 2026-08-12).',
    )
  })
})
