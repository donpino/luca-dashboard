import { describe, expect, it } from 'vitest'
import { decideDispatch, syncPhase, type RunInfo } from './syncStatus'

const T0 = Date.parse('2026-10-28T10:00:00Z')
const run = (minutesAfterT0: number, status: string, conclusion: string | null = null): RunInfo => ({
  status,
  conclusion,
  created_at: new Date(T0 + minutesAfterT0 * 60_000).toISOString(),
})

describe('decideDispatch', () => {
  it('allows the first sync ever', () => {
    expect(decideDispatch(null, T0)).toEqual({ ok: true })
  })

  it('refuses while a sync is running', () => {
    expect(decideDispatch(run(0, 'in_progress'), T0 + 60_000)).toEqual({ ok: false, reason: 'running' })
  })

  it('enforces the 10-minute cooldown from the last run start', () => {
    const last = run(0, 'completed', 'success')
    expect(decideDispatch(last, T0 + 9 * 60_000)).toEqual({
      ok: false,
      reason: 'cooldown',
      retry_at: '2026-10-28T10:10:00.000Z',
    })
    expect(decideDispatch(last, T0 + 10 * 60_000)).toEqual({ ok: true })
  })
})

describe('syncPhase', () => {
  it('is syncing until our run appears and finishes', () => {
    expect(syncPhase({ sync: run(-30, 'completed', 'success'), deploy: null }, T0)).toBe('syncing')
    expect(syncPhase({ sync: run(0, 'in_progress'), deploy: null }, T0)).toBe('syncing')
  })

  it('is publishing until the deploy after our sync succeeds', () => {
    const sync = run(0, 'completed', 'success')
    expect(syncPhase({ sync, deploy: run(-20, 'completed', 'success') }, T0)).toBe('publishing')
    expect(syncPhase({ sync, deploy: run(1, 'in_progress') }, T0)).toBe('publishing')
    expect(syncPhase({ sync, deploy: run(1, 'completed', 'success') }, T0)).toBe('done')
  })

  it('reports a failed sync or deploy', () => {
    expect(syncPhase({ sync: run(0, 'completed', 'failure'), deploy: null }, T0)).toBe('failed')
    expect(syncPhase({ sync: run(0, 'completed', 'success'), deploy: run(1, 'completed', 'failure') }, T0)).toBe('failed')
  })
})
