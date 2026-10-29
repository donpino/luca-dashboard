// §8.1 v1.41 — the "Your cards" detail pages: HRV, resting HR, sleep time
// and weekly km over time. Opened from a Today card (Shin opens Block,
// whose chart already is shin over time). Every value and stat is read off
// metrics.json / days/<date>.json (CLAUDE.md rule 3); a picked day's
// payload already ends on that day.

import PageLoader from '../components/PageLoader'
import TrendCard from '../components/TrendCard'
import { useDayData } from '../components/useDayData'
import type { MetricKey, MetricsResponse } from '../panels/metrics'
import { COLOR } from '../panels/scores'
import { fmtDay, fmtMinutes } from '../panels/scoresCopy'
import { Hero, Shell } from './ScoreDetail'

const fmtMs = (v: number | null) => (v === null ? '—' : `${Math.round(v)} ms`)
const fmtBpm = (v: number | null) => (v === null ? '—' : `${Math.round(v)} bpm`)
const fmtKm = (v: number | null) => (v === null ? '—' : `${v.toFixed(1)} km`)
const fmtSleep = (v: number | null) => fmtMinutes(v)

const META: Record<MetricKey, { title: string; trend: string; color: string; format: (v: number | null) => string }> = {
  hrv: { title: 'HRV', trend: 'OVERNIGHT HRV', color: COLOR.strain, format: fmtMs },
  rhr: { title: 'Resting HR', trend: 'RESTING HR', color: COLOR.rhr, format: fmtBpm },
  sleep_min: { title: 'Sleep', trend: 'TIME ASLEEP', color: COLOR.sleep, format: fmtSleep },
  weekly_km: { title: 'Weekly km', trend: 'RUNNING KM PER WEEK', color: COLOR.green, format: fmtKm },
}

function Body({ kind, data, onBack }: { kind: MetricKey; data: MetricsResponse; onBack: () => void }) {
  const m = META[kind]
  if (kind === 'weekly_km') {
    const week = data.weeks[data.weeks.length - 1] ?? null
    return (
      <Shell kind="metric" title={m.title} sub="Running only · Monday to Sunday" onBack={onBack}>
        <Hero level={0.55} color={m.color} text="">
          <dl className="kv">
            <dt>THIS WEEK</dt>
            <dd>{fmtKm(week?.weekly_km ?? null)}</dd>
            <dt>SINCE</dt>
            <dd>{week ? fmtDay(week.date) : '—'}</dd>
          </dl>
        </Hero>
        <h2 className="section">TREND</h2>
        <TrendCard
          series={data.weeks}
          valueKey="weekly_km"
          ranges={data.ranges.weekly_km}
          rangeOptions={data.range_options}
          title={m.trend}
          color={m.color}
          format={fmtKm}
        />
      </Shell>
    )
  }
  const latest = [...data.series].reverse().find((e) => e[kind] !== null) ?? null
  return (
    <Shell kind="metric" title={m.title} sub={latest ? `Night ending ${fmtDay(latest.date)}` : 'No night recorded yet'} onBack={onBack}>
      <Hero level={0.55} color={m.color} text="">
        <dl className="kv">
          <dt>LAST NIGHT</dt>
          <dd>{m.format(latest ? latest[kind] : null)}</dd>
          {kind === 'rhr' && (
            <>
              <dt>BAND</dt>
              <dd>{latest?.rhr_band ? `${Math.round(latest.rhr_band[0])}–${Math.round(latest.rhr_band[1])} bpm` : 'building'}</dd>
            </>
          )}
        </dl>
      </Hero>
      <h2 className="section">TREND</h2>
      <TrendCard
        series={data.series}
        valueKey={kind}
        ranges={data.ranges[kind]}
        rangeOptions={data.range_options}
        title={m.trend}
        color={m.color}
        bandKey={kind === 'rhr' ? 'rhr_band' : undefined}
        format={m.format}
      />
      {kind === 'rhr' && <p className="note">The shaded lane is your resting-HR band as it stood each day.</p>}
    </Shell>
  )
}

export default function MetricDetail({ kind, day, onBack }: { kind: MetricKey; day: string | null; onBack: () => void }) {
  const state = useDayData(day).metrics
  if (state.status === 'loading')
    return (
      <div className="screen">
        <PageLoader color={META[kind].color} />
      </div>
    )
  if (state.status === 'error') return <p className="status-text status-text--error">Couldn&rsquo;t load the data.</p>
  return <Body kind={kind} data={state.data} onBack={onBack} />
}
