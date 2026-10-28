// One score's trend: range selector (§9), ECharts line on a fixed axis, and
// MEAN / MIN / MAX / delta from compute's range_stats (§7 v1.35). The series
// is filtered by date to the selected range — selection, not computation,
// same as the §8.3 panel (v1.18); the stats are read, never recomputed.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { RangeKey, ScoreKey, ScoresResponse } from '../panels/scores'
import { fmtDay, fmtDelta, rangeLabel } from '../panels/scoresCopy'

interface Props {
  data: ScoresResponse
  scoreKey: ScoreKey
  title: string
  color: string
  yMax: number
  format: (v: number | null) => string
}

function defaultRange(data: ScoresResponse, key: ScoreKey): RangeKey {
  return data.ranges[key]['30d'].locked ? 'all' : '30d'
}

export default function TrendCard({ data, scoreKey, title, color, yMax, format }: Props) {
  const [range, setRange] = useState<RangeKey>(() => defaultRange(data, scoreKey))
  const chartRef = useRef<HTMLDivElement | null>(null)
  const info = data.ranges[scoreKey][range]

  const points = useMemo(
    () => data.series.filter((e) => e.date >= info.start).map((e) => [e.date, e[scoreKey]] as [string, number | null]),
    [data, info.start, scoreKey],
  )
  const latest = [...points].reverse().find(([, v]) => v !== null)

  useEffect(() => {
    if (!chartRef.current) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const chart = echarts.init(chartRef.current)
    chart.setOption({
      animation: !reducedMotion,
      grid: { left: 30, right: 8, top: 10, bottom: 24 },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.18)' } },
        axisLabel: { color: '#9AA3AE', fontSize: 11, hideOverlap: true, formatter: '{d} {MMM}' },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax,
        interval: yMax === 21 ? 7 : 25,
        axisLabel: { color: '#9AA3AE', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.07)' } },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1A1D22',
        borderColor: '#2A2F37',
        textStyle: { color: '#F2F4F7' },
        valueFormatter: (v: unknown) => format(typeof v === 'number' ? v : null),
      },
      series: [
        {
          type: 'line',
          data: points,
          connectNulls: false,
          // a dot on every day (athlete's request, 28 Oct), ringed in the
          // card colour so neighbouring dots stay distinct
          showSymbol: true,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { color, width: 2 },
          itemStyle: { color, borderColor: '#1A1D22', borderWidth: 1.5 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: `${color}59` },
              { offset: 1, color: `${color}00` },
            ]),
          },
        },
      ],
    })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [points, color, yMax, format])

  const stats = info.stats
  const delta = stats ? fmtDelta(stats.delta) : null
  return (
    <>
      <div className="seg" role="group" aria-label="Range">
        {data.range_options.map((rk) => {
          const r = data.ranges[scoreKey][rk]
          return (
            <button
              key={rk}
              type="button"
              className={rk === range ? 'seg__item seg__item--active' : 'seg__item'}
              disabled={r.locked}
              aria-pressed={rk === range}
              title={r.locked && r.unlocks_on ? `Unlocks ${fmtDay(r.unlocks_on)}` : undefined}
              onClick={() => setRange(rk)}
            >
              {rangeLabel(rk)}
            </button>
          )
        })}
      </div>
      {data.range_options.some((rk) => data.ranges[scoreKey][rk].locked) && (
        <p className="note">Longer ranges unlock as FR70 history builds.</p>
      )}
      <section className="card trend" aria-label={`${title} trend`}>
        <div className="trend__head">
          <span className="label">{title}</span>
          <span className="trend__latest">{latest ? format(latest[1]) : '—'}</span>
        </div>
        <div ref={chartRef} className="trend__chart" />
        <div className="stats">
          {(['mean', 'min', 'max'] as const).map((k) => (
            <div key={k} className="stats__cell">
              <span className="label">{k.toUpperCase()}</span>
              <span className="stats__value">{stats ? format(stats[k]) : '—'}</span>
            </div>
          ))}
          {delta && (
            <span className="pill" title="vs the previous equal-length window">
              {delta}
            </span>
          )}
        </div>
      </section>
    </>
  )
}
