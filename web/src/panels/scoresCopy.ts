// Display formatting for the v1.35 score pages. Rounding and wording only —
// every value arrives computed from compute/metrics.py (CLAUDE.md rule 3).

import type { RecoveryInputKey } from './scores'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function fmtDay(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split('-').map(Number)
  return `${d} ${MONTHS[m - 1]}`
}

export function fmtScore(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(Math.round(value))
}

export function fmtStrain(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toFixed(1)
}

export function fmtMinutes(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

export function fmtClock(isoLocal: string | null | undefined): string {
  return isoLocal ? isoLocal.slice(11, 16) : '—'
}

export function fmtDelta(delta: number | null, decimals = 1): string | null {
  if (delta === null) return null
  const rounded = Number(delta.toFixed(decimals))
  if (rounded === 0) return `→ 0`
  return `${rounded > 0 ? '↗ +' : '↘ −'}${Math.abs(rounded).toFixed(decimals)}`
}

export function fmtPct(fraction: number | null | undefined): string {
  return fraction === null || fraction === undefined ? '—' : `${Math.round(fraction * 100)}%`
}

export const INPUT_LABEL: Record<RecoveryInputKey, string> = {
  hrv: 'Heart-rate variability',
  rhr: 'Resting heart rate',
  sleep: 'Sleep',
  respiration: 'Respiration',
  prior_strain: 'Prior-day strain',
}

const INPUT_UNIT: Record<RecoveryInputKey, string> = {
  hrv: ' ms',
  rhr: ' bpm',
  sleep: '',
  respiration: ' rpm',
  prior_strain: '',
}

export function fmtInput(key: RecoveryInputKey, value: number | null): string {
  if (value === null) return '—'
  const digits = key === 'respiration' || key === 'prior_strain' ? 1 : 0
  return `${value.toFixed(digits)}${INPUT_UNIT[key]}`
}

export function rangeLabel(key: string): string {
  return key === 'all' ? 'ALL' : key.toUpperCase()
}
