// §8.1 v1.39 — opened by tapping the Today title. A month grid with one
// small sphere per day for the chosen score (Recovery / Strain / Sleep,
// the three chips act as a filter), so the athlete sees the month at a
// glance and jumps straight to a day. Values come from scores.json's
// `series` as-is; a day without a value has no sphere, never a 0.
// v1.42: `mode="week"` serves the Week page — the selected week's row is
// highlighted and tapping any day picks its week (Monday).

import PageLoader from './PageLoader'
import { useState } from 'react'
import { BAND_COLOR, COLOR, STRAIN_MAX, type ScoreKey, type ScoresResponse, type SeriesEntry } from '../panels/scores'
import { fmtScore, fmtStrain } from '../panels/scoresCopy'
import LiquidSphere from './LiquidSphere'
import { useJson } from './useJson'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const FILTERS: { key: ScoreKey; label: string }[] = [
  { key: 'recovery', label: 'RECOVERY' },
  { key: 'strain', label: 'STRAIN' },
  { key: 'sleep', label: 'SLEEP' },
]

function sphere(key: ScoreKey, e: SeriesEntry | undefined): { level: number; color: string; text: string } | null {
  if (!e) return null
  if (key === 'recovery') return e.recovery === null || e.band === null ? null : { level: e.recovery / 100, color: BAND_COLOR[e.band], text: fmtScore(e.recovery) }
  if (key === 'strain') return e.strain === null ? null : { level: e.strain / STRAIN_MAX, color: COLOR.strain, text: fmtStrain(e.strain) }
  return e.sleep === null ? null : { level: e.sleep / 100, color: COLOR.sleep, text: fmtScore(e.sleep) }
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

// calendar layout only: the Monday of the grid row a date sits in
function mondayOf(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7))
  return t.toISOString().slice(0, 10)
}

interface Props {
  mode?: 'day' | 'week'
  selected: string | null // a day, or a week's Monday; null = the current one
  onPick: (picked: string | null) => void // null = back to the current one
  onClose: () => void
}

export default function DayPicker({ mode = 'day', selected, onPick, onClose }: Props) {
  // always the live file: its series runs to the newest day
  const state = useJson<ScoresResponse>('scores.json')
  const [filter, setFilter] = useState<ScoreKey>('recovery')
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null)

  if (state.status !== 'ready') {
    return (
      <div className="daypick" role="dialog" aria-label="Choose a day">
        {state.status === 'loading' ? <PageLoader /> : <p className="status-text status-text--error">Couldn’t load scores.json.</p>}
      </div>
    )
  }
  const { series, as_of: asOf } = state.data
  // week mode reaches back to the Monday of the first scored day's week
  const first = mode === 'week' && series.length ? mondayOf(series[0].date) : series.length ? series[0].date : asOf
  const byDate = new Map(series.map((e) => [e.date, e]))
  const anchor = selected ?? asOf
  const view = month ?? { y: Number(anchor.slice(0, 4)), m: Number(anchor.slice(5, 7)) - 1 }
  const daysIn = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate()
  const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7 // Mon-first
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]
  const shift = (delta: number) => {
    const t = view.m + delta
    setMonth({ y: view.y + Math.floor(t / 12), m: ((t % 12) + 12) % 12 })
  }
  const canPrev = iso(view.y, view.m, 1) > first
  const canNext = iso(view.y, view.m, daysIn) < asOf

  return (
    <div className="daypick" role="dialog" aria-label={mode === 'week' ? 'Choose a week' : 'Choose a day'}>
      <div className="daypick__head">
        <button type="button" className="round-btn" onClick={() => shift(-1)} disabled={!canPrev} aria-label="Previous month">
          ‹
        </button>
        <span className="daypick__month">
          {MONTHS[view.m]} {view.y}
        </span>
        <button type="button" className="round-btn" onClick={() => shift(1)} disabled={!canNext} aria-label="Next month">
          ›
        </button>
        <button type="button" className="round-btn" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <div className="daypick__filters" role="group" aria-label="Score shown">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={f.key === filter ? 'chip chip--on' : 'chip'}
            aria-pressed={f.key === filter}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="daypick__grid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => (
          <span key={i} className="daypick__dow">
            {l}
          </span>
        ))}
        {cells.map((n, i) => {
          if (n === null) return <span key={`b${i}`} />
          const day = iso(view.y, view.m, n)
          const s = sphere(filter, byDate.get(day))
          const usable = day >= first && day <= asOf
          const week = mondayOf(day)
          const current = mode === 'week' ? mondayOf(asOf) : asOf
          const isSelected = mode === 'week' ? week === (selected ?? current) : day === (selected ?? asOf)
          const pick = mode === 'week' ? week : day
          return (
            <button
              key={day}
              type="button"
              className={`daypick__day${isSelected ? (mode === 'week' ? ' daypick__day--week' : ' daypick__day--on') : ''}`}
              disabled={!usable}
              onClick={() => onPick(pick === current ? null : pick)}
              aria-label={s ? `${n} ${MONTHS[view.m]}: ${s.text}` : `${n} ${MONTHS[view.m]}`}
            >
              <span className="daypick__num">{n}</span>
              {s ? <LiquidSphere size={26} level={s.level} color={s.color} bubbles={false} /> : <span className="daypick__empty" />}
            </button>
          )
        })}
      </div>
    </div>
  )
}
