// §8.1 v1.35 score detail pages — Recovery, Strain, Sleep. Opened from a
// Today sphere; React state, not routes (v1.25). Each page shows the
// measured inputs behind its score (§3.1 v1.35: a score is never a dead
// end). Every number is read from scores.json (CLAUDE.md rule 3).

import PageLoader from '../components/PageLoader'
import type { ReactNode } from 'react'
import LiquidSphere from '../components/LiquidSphere'
import TrendCard from '../components/TrendCard'
import { useDayData } from '../components/useDayData'
import {
  BAND_COLOR,
  COLOR,
  STRAIN_MAX,
  type RecoveryInputKey,
  type ScoreKey,
  type ScoresResponse,
  type SeriesEntry,
} from '../panels/scores'
import { INPUT_LABEL, fmtClock, fmtDay, fmtInput, fmtMinutes, fmtPct, fmtScore, fmtStrain } from '../panels/scoresCopy'

const fmtScoreN = (v: number | null) => fmtScore(v)
const fmtStrainN = (v: number | null) => fmtStrain(v)

function Shell({ kind, title, sub, onBack, children }: { kind: ScoreKey; title: string; sub: string; onBack: () => void; children: ReactNode }) {
  return (
    <div className={`screen screen--${kind}`}>
      <button type="button" className="round-btn round-btn--back" onClick={onBack} aria-label="Back to Today">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <header className="detail-head">
        <h1 className="detail-head__title">{title}</h1>
        <p className="detail-head__sub">{sub}</p>
      </header>
      {children}
    </div>
  )
}

function Hero({ level, color, text, children }: { level: number | null; color: string; text: string; children: ReactNode }) {
  return (
    <section className="card hero">
      <span className="scores__sphere scores__sphere--hero">
        <LiquidSphere size={116} level={level} color={color} />
        <span className="scores__num scores__num--hero">{text}</span>
      </span>
      <div className="hero__side">{children}</div>
    </section>
  )
}

// --- Recovery ---------------------------------------------------------------

const INPUT_ORDER: RecoveryInputKey[] = ['hrv', 'rhr', 'sleep', 'respiration', 'prior_strain']
const INPUT_COLOR: Record<RecoveryInputKey, string> = {
  hrv: COLOR.strain,
  rhr: COLOR.rhr,
  sleep: '#2BB8A6',
  respiration: COLOR.accent,
  prior_strain: COLOR.sleep,
}

function Calendar({ series }: { series: SeriesEntry[] }) {
  // Last 13 weeks, Mon-first columns. Layout only: each cell is one
  // series entry's band, read as-is; a day without a score stays empty.
  const byDate = new Map(series.map((e) => [e.date, e]))
  const last = series.length ? series[series.length - 1].date : null
  if (!last) return null
  const [y, m, d] = last.split('-').map(Number)
  const end = new Date(Date.UTC(y, m - 1, d))
  const mondayOffset = (end.getUTCDay() + 6) % 7
  const firstMonday = new Date(end.getTime() - (mondayOffset + 12 * 7) * 86400000)
  const weeks = Array.from({ length: 13 }, (_, w) =>
    Array.from({ length: 7 }, (_, dow) => {
      const day = new Date(firstMonday.getTime() + (w * 7 + dow) * 86400000).toISOString().slice(0, 10)
      return { day, entry: byDate.get(day) ?? null, future: day > last }
    }),
  )
  return (
    <div className="cal" role="img" aria-label="Recovery band per day, last 13 weeks">
      <div className="cal__days">
        {['Mon', '', 'Wed', '', 'Fri', '', 'Sun'].map((l, i) => (
          <span key={i}>{l}</span>
        ))}
      </div>
      {weeks.map((col, i) => (
        <div key={i} className="cal__col">
          {col.map(({ day, entry, future }) => (
            <span
              key={day}
              className={future ? 'cal__cell cal__cell--future' : 'cal__cell'}
              style={entry?.band ? { background: BAND_COLOR[entry.band] } : undefined}
              title={entry?.recovery != null ? `${fmtDay(day)}: ${fmtScore(entry.recovery)}` : fmtDay(day)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function RecoveryPage({ data, onBack }: { data: ScoresResponse; onBack: () => void }) {
  const r = data.recovery
  const color = r ? BAND_COLOR[r.band] : COLOR.green
  return (
    <Shell kind="recovery" title="Recovery" sub={r ? `${fmtDay(r.date)} · vs your FR70 baseline` : 'vs your FR70 baseline'} onBack={onBack}>
      <Hero level={r ? r.score / 100 : null} color={color} text={r ? fmtScore(r.score) : '—'}>
        {r ? (
          <>
            <span className="chip" style={{ color, background: `${color}2E` }}>
              {r.band.toUpperCase()}
            </span>
            {!r.trusted && <p className="row__sub">Provisional — HRV baseline under 14 nights.</p>}
          </>
        ) : (
          <p className="row__sub">
            Calibrating
            {data.recovery_calibrating && ` — ${data.recovery_calibrating.n}/${data.recovery_calibrating.required} nights of HRV`}
          </p>
        )}
      </Hero>

      {r && (
        <>
          <div className="section-row">
            <h2 className="section">CONTRIBUTORS</h2>
            <span className="note">weight in score</span>
          </div>
          <section className="card contrib">
            {INPUT_ORDER.filter((k) => r.inputs[k]).map((k) => {
              const inp = r.inputs[k]!
              const w = r.weights[k] ?? 0
              return (
                <div key={k} className="contrib__row">
                  <div className="contrib__top">
                    <span className="contrib__name">{INPUT_LABEL[k]}</span>
                    <span className="contrib__val">{fmtInput(k, inp.value)}</span>
                  </div>
                  <span className="contrib__base">
                    {k === 'sleep'
                      ? `Sleep without HRV / RHR · your usual ${fmtInput(k, inp.baseline)}`
                      : `30-day baseline ${fmtInput(k, inp.baseline)}`}
                  </span>
                  <span className="bar">
                    <span className="bar__fill" style={{ width: `${w * 100}%`, background: INPUT_COLOR[k] }} />
                  </span>
                  <span className="contrib__w">{fmtPct(w)}</span>
                </div>
              )
            })}
            <p className="note">Body temperature and overnight HR slope aren’t measured by the FR70; their weight is redistributed.</p>
          </section>
        </>
      )}

      <h2 className="section">TREND</h2>
      <TrendCard data={data} scoreKey="recovery" title="RECOVERY" color={COLOR.green} yMax={100} format={fmtScoreN} />

      <h2 className="section">CALENDAR</h2>
      <section className="card">
        <span className="card__title">Recovery — last 13 weeks</span>
        <Calendar series={data.series} />
        <div className="legend">
          <span>Depleted</span>
          <span className="legend__bar" />
          <span>Peaked</span>
        </div>
      </section>
    </Shell>
  )
}

// --- Strain -----------------------------------------------------------------

function WeekBars({ data }: { data: ScoresResponse }) {
  const byDate = new Map(data.series.map((e) => [e.date, e]))
  const [y, m, d] = data.week_start.split('-').map(Number)
  const start = Date.UTC(y, m - 1, d)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, i) => {
    const day = new Date(start + i * 86400000).toISOString().slice(0, 10)
    return { label, day, value: byDate.get(day)?.strain ?? null }
  })
  return (
    <div className="weekbars" role="img" aria-label="Strain this week">
      {days.map(({ label, day, value }) => (
        <div key={day} className="weekbars__col">
          <span className="weekbars__val">{value !== null ? fmtStrain(value) : ''}</span>
          <span className="weekbars__track">
            {value !== null && <span className="weekbars__bar" style={{ height: `${(value / STRAIN_MAX) * 100}%` }} />}
          </span>
          <span className="weekbars__day">{label}</span>
        </div>
      ))}
    </div>
  )
}

function StrainPage({ data, onBack }: { data: ScoresResponse; onBack: () => void }) {
  const s = data.strain
  return (
    <Shell kind="strain" title="Strain" sub="Cardiovascular load, 0–21 · all-day HR + activities" onBack={onBack}>
      <TrendCard data={data} scoreKey="strain" title="STRAIN" color={COLOR.strain} yMax={STRAIN_MAX} format={fmtStrainN} />

      <h2 className="section">THIS WEEK</h2>
      <section className="card">
        <WeekBars data={data} />
      </section>

      <h2 className="section">{s ? fmtDay(s.date).toUpperCase() : 'LATEST DAY'}</h2>
      <section className="card list">
        {s ? (
          <>
            <div className="list__row">
              <span className="dot" style={{ background: COLOR.strain }} />
              <div className="row__text">
                <span className="row__name row__name--plain">Activities</span>
                <span className="row__sub">
                  {s.activities.length
                    ? s.activities
                        .map((a) => `${a.type}${a.duration_s ? ` ${Math.round(a.duration_s / 60)}′` : ''}${a.avg_hr ? ` · ${a.avg_hr} bpm` : ''}`)
                        .join(', ')
                    : 'None recorded'}
                </span>
              </div>
              <span className="row__value">{fmtPct(s.activity_share)}</span>
            </div>
            <div className="list__row">
              <span className="dot" style={{ background: COLOR.sleep }} />
              <div className="row__text">
                <span className="row__name row__name--plain">Rest of day</span>
                <span className="row__sub">All-day HR, 2-minute samples</span>
              </div>
              <span className="row__value">{s.activity_share === null ? '—' : fmtPct(1 - s.activity_share)}</span>
            </div>
            <p className="note">Share of the day’s load. Day strain {fmtStrain(s.strain)}.</p>
          </>
        ) : (
          <p className="row__sub">No strain yet — needs all-day HR from the watch.</p>
        )}
      </section>
    </Shell>
  )
}

// --- Sleep ------------------------------------------------------------------

const PARTS = [
  { key: 'duration', label: 'HOURS VS NEED', color: COLOR.accent },
  { key: 'deep', label: 'DEEP', color: COLOR.strain },
  { key: 'rem', label: 'REM', color: COLOR.violet },
  { key: 'hrv', label: 'HRV', color: COLOR.strain },
  { key: 'rhr', label: 'RESTING HR', color: COLOR.rhr },
  { key: 'efficiency', label: 'EFFICIENCY', color: COLOR.green },
  { key: 'consistency', label: 'CONSISTENCY', color: '#2BB8A6' },
] as const

// unit for a personal part's "you vs your usual" line
const PART_UNIT = { deep: ' min', rem: ' min', hrv: ' ms', rhr: ' bpm' } as const

function SleepPage({ data, onBack }: { data: ScoresResponse; onBack: () => void }) {
  const s = data.sleep
  const n = s?.night
  const stages = n
    ? [
        { label: 'DEEP', min: n.sleep_deep_min, color: COLOR.strain },
        { label: 'REM', min: n.sleep_rem_min, color: COLOR.violet },
        { label: 'LIGHT', min: n.sleep_light_min, color: '#7FA6D8' },
        { label: 'AWAKE', min: n.sleep_awake_min, color: COLOR.rhr },
      ]
    : []
  const longest = Math.max(1, ...stages.map((st) => st.min ?? 0))
  return (
    <Shell kind="sleep" title="Sleep" sub={s ? `Night ending ${fmtDay(s.date)}` : 'No scored night yet'} onBack={onBack}>
      <Hero level={s ? s.score / 100 : null} color={COLOR.sleep} text={fmtScore(s?.score)}>
        <dl className="kv">
          <dt>ASLEEP</dt>
          <dd>{fmtMinutes(n?.sleep_total_min)}</dd>
          <dt>NEED</dt>
          <dd>{s ? fmtMinutes(s.need_hours * 60) : '—'}</dd>
          <dt>IN BED</dt>
          <dd>
            {fmtClock(n?.sleep_start_local)} → {fmtClock(n?.sleep_end_local)}
          </dd>
        </dl>
      </Hero>

      {s && (
        <>
          <h2 className="section">WHAT MADE THE SCORE</h2>
          <div className="tiles">
            {PARTS.map((p) => {
              const v = s.parts[p.key]
              const w = s.weights[p.key]
              const inp = p.key in PART_UNIT ? s.inputs[p.key as keyof typeof PART_UNIT] : undefined
              const unit = p.key in PART_UNIT ? PART_UNIT[p.key as keyof typeof PART_UNIT] : ''
              return (
                <div key={p.key} className="card tile">
                  <div className="tile__head">
                    <span className="label">{p.label}</span>
                    {w !== undefined && <span className="note">{fmtPct(w)}</span>}
                  </div>
                  <span className="tile__value" style={{ color: v === undefined ? undefined : p.color }}>
                    {v === undefined ? '—' : fmtPct(v)}
                  </span>
                  {v === undefined && <span className="row__sub">Not enough nights yet</span>}
                  {inp && (
                    <span className="row__sub">
                      {Math.round(inp.value)}
                      {unit} · usual {Math.round(inp.baseline ?? 0)}
                      {unit}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          <h2 className="section">STAGES</h2>
          <section className="card stages">
            {stages.map((st) => (
              <div key={st.label} className="stages__row">
                <div className="contrib__top">
                  <span className="label" style={{ color: st.color }}>
                    {st.label}
                  </span>
                  <span className="contrib__val">{fmtMinutes(st.min)}</span>
                </div>
                <span className="bar">
                  {st.min !== null && <span className="bar__fill" style={{ width: `${(st.min / longest) * 100}%`, background: st.color }} />}
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      <h2 className="section">TREND</h2>
      <TrendCard data={data} scoreKey="sleep" title="SLEEP" color={COLOR.sleep} yMax={100} format={fmtScoreN} />
    </Shell>
  )
}

// v1.39: `day` is the day picked on Today (null = live). A past day's
// payload already ends on that day, so every trend and stat stops there.
export default function ScoreDetail({ kind, day, onBack }: { kind: ScoreKey; day: string | null; onBack: () => void }) {
  const state = useDayData(day).scores
  if (state.status === 'loading')
    return (
      <div className={`screen screen--${kind}`}>
        <PageLoader />
      </div>
    )
  if (state.status === 'error') return <p className="status-text status-text--error">Couldn&rsquo;t load the scores.</p>
  if (kind === 'recovery') return <RecoveryPage data={state.data} onBack={onBack} />
  if (kind === 'strain') return <StrainPage data={state.data} onBack={onBack} />
  return <SleepPage data={state.data} onBack={onBack} />
}
