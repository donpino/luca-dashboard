// §8.1 v1.35 — default landing tab, the athlete's daily ten-second check.
// Two pre-computed files: today.json (session, flag, metric cards —
// build_today()) and scores.json (the three spheres — build_scores()).
// Every number and decision was made in compute/metrics.py (CLAUDE.md
// rule 3); this page lays it out.

import { useCallback, useState } from 'react'
import LiquidSphere from '../components/LiquidSphere'
import SyncButton from '../components/SyncButton'
import { useJson } from '../components/useJson'
import { flagLabel, flagText } from '../panels/flagCopy'
import { BAND_COLOR, COLOR, STRAIN_MAX, type ScoreKey, type ScoresResponse } from '../panels/scores'
import { fmtDay, fmtMinutes, fmtScore, fmtStrain } from '../panels/scoresCopy'
import type { TodayResponse } from '../panels/today'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]}, ${fmtDay(iso).replace(' ', ' ')}`
}

function Chevron() {
  return (
    <svg className="chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface ScoreCardProps {
  scores: ScoresResponse
  latestDay: string | null
  onOpen: (key: ScoreKey) => void
}

function ScoreCard({ scores, latestDay, onOpen }: ScoreCardProps) {
  const rec = scores.recovery
  const items: { key: ScoreKey; label: string; level: number | null; text: string; color: string; date: string | null }[] = [
    {
      key: 'recovery',
      label: 'RECOVERY',
      level: rec ? rec.score / 100 : null,
      text: rec ? fmtScore(rec.score) : '—',
      color: rec ? BAND_COLOR[rec.band] : COLOR.green,
      date: rec?.date ?? null,
    },
    {
      key: 'strain',
      label: 'STRAIN',
      level: scores.strain ? scores.strain.strain / STRAIN_MAX : null,
      text: fmtStrain(scores.strain?.strain),
      color: COLOR.strain,
      date: scores.strain?.date ?? null,
    },
    {
      key: 'sleep',
      label: 'SLEEP',
      level: scores.sleep ? scores.sleep.score / 100 : null,
      text: fmtScore(scores.sleep?.score),
      color: COLOR.sleep,
      date: scores.sleep?.date ?? null,
    },
  ]
  return (
    <section className="scores" aria-label="Scores">
      {items.map((it) => (
        <button key={it.key} type="button" className="scores__item" onClick={() => onOpen(it.key)}>
          <span className="scores__sphere">
            <LiquidSphere size={96} level={it.level} color={it.color} />
            <span className="scores__num">{it.text}</span>
          </span>
          <span className="scores__label">
            {it.label}
            <Chevron />
          </span>
          {it.key === 'recovery' && scores.recovery_calibrating && (
            <span className="scores__sub">
              Calibrating {scores.recovery_calibrating.n}/{scores.recovery_calibrating.required}
            </span>
          )}
          {/* v1.30 rule kept: a reading never looks more current than it is */}
          {it.date && latestDay && it.date < latestDay && <span className="scores__sub">{fmtDay(it.date)}</span>}
        </button>
      ))}
    </section>
  )
}

interface RowProps {
  name: string
  sub: string
  value: string
  color: string
}

function MetricRow({ name, sub, value, color }: RowProps) {
  return (
    <div className="row card">
      {/* decorative icon, fixed fill — carries no value (§8.1 v1.35) */}
      <LiquidSphere size={44} level={0.55} color={color} bubbles={false} />
      <div className="row__text">
        <span className="row__name">{name}</span>
        <span className="row__sub">{sub}</span>
      </div>
      <span className="row__value">{value}</span>
    </div>
  )
}

export default function Today({ onOpen }: { onOpen: (key: ScoreKey) => void }) {
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => setVersion(Date.now()), [])
  const today = useJson<TodayResponse>('today.json', version)
  const scores = useJson<ScoresResponse>('scores.json', version)

  if (today.status === 'loading' || scores.status === 'loading') {
    return <p className="status-text status-text--muted">Loading…</p>
  }
  if (today.status === 'error') {
    return <p className="status-text status-text--error">Couldn&rsquo;t load today.json.</p>
  }
  const t = today.data
  const s = scores.status === 'ready' ? scores.data : null
  const night = t.last_night
  const cards = t.cards
  // newest date any score has; a sphere older than it shows its own date
  const scoreDates = [s?.recovery?.date, s?.strain?.date, s?.sleep?.date].filter((d): d is string => !!d).sort()
  const latestDay = scoreDates.length ? scoreDates[scoreDates.length - 1] : null

  return (
    <div className="screen screen--today">
      <header className="today-head">
        <div>
          <h1 className="today-head__title">Today</h1>
          <p className="today-head__date">{longDate(t.date)}</p>
        </div>
        {s?.recovery && <LiquidSphere size={40} level={s.recovery.score / 100} color={BAND_COLOR[s.recovery.band]} bubbles={false} />}
        <SyncButton onDone={reload} />
        <a className="round-btn" href="/log/" aria-label="Log today">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </a>
      </header>

      {s?.data_through_ms && (
        <p className="sync-status">
          Today so far · as of{' '}
          {new Date(s.data_through_ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · completes tomorrow
          morning
        </p>
      )}

      {s ? (
        <ScoreCard scores={s} latestDay={latestDay} onOpen={onOpen} />
      ) : (
        <p className="status-text status-text--error">Couldn&rsquo;t load scores.json.</p>
      )}

      {t.flag && (
        <section className="card card--flag" aria-label="Flag">
          <span className="label label--amber">{flagLabel(t.flag)}</span>
          <p className="card__text">{flagText(t.flag)}</p>
        </section>
      )}

      <h2 className="section">TODAY&rsquo;S SESSION</h2>
      <section className="card session" aria-label="Today's session">
        {t.session === null ? (
          <p className="row__sub">No session logged for today.</p>
        ) : (
          <>
            <span className="row__name">{(t.session.session_type ?? 'Session').toUpperCase()}</span>
            {t.session.purpose && <p className="row__sub">{t.session.purpose}</p>}
            {t.session.prescription && <p className="session__rx">{t.session.prescription}</p>}
          </>
        )}
      </section>

      <h2 className="section">YOUR CARDS</h2>
      <div className="rows">
        <MetricRow
          name="HRV"
          sub={
            cards.hrv_means?.mean_7d != null && cards.hrv_means.mean_30d != null
              ? `7-day ${Math.round(cards.hrv_means.mean_7d)} · 30-day ${Math.round(cards.hrv_means.mean_30d)}`
              : 'Baseline building'
          }
          value={night?.hrv_overnight != null ? `${night.hrv_overnight} ms` : '—'}
          color={COLOR.strain}
        />
        <MetricRow
          name="RESTING HR"
          sub={cards.rhr_band ? `Band ${Math.round(cards.rhr_band[0])}–${Math.round(cards.rhr_band[1])}` : 'Band building'}
          value={night?.rhr != null ? `${night.rhr} bpm` : '—'}
          color={COLOR.rhr}
        />
        <MetricRow
          name="SLEEP"
          sub={s?.sleep ? `Need ${fmtMinutes(s.sleep.need_hours * 60)}` : 'No scored night'}
          value={fmtMinutes(night?.sleep_total_min)}
          color={COLOR.sleep}
        />
        <MetricRow name="WEEKLY KM" sub={`Running only · since ${fmtDay(cards.week_start)}`} value={cards.weekly_km.toFixed(1)} color={COLOR.green} />
        <MetricRow
          name="SHIN"
          sub={cards.shin_latest ? `Answered ${fmtDay(cards.shin_latest.date)}` : 'Not answered yet'}
          value={cards.shin_latest ? `${cards.shin_latest.shin} / 3` : '—'}
          color={COLOR.amber}
        />
      </div>
      {night && night.days_behind > 1 && (
        <p className="note">Latest night synced is {fmtDay(night.date)} — {night.days_behind} days ago.</p>
      )}
    </div>
  )
}
