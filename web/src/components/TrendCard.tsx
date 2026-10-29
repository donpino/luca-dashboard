// One value's trend: range selector (§9), ECharts line, and MEAN / MIN /
// MAX / delta from compute's range_stats (§7 v1.35). The series is filtered
// by date to the selected range — selection, not computation, same as the
// §8.3 panel (v1.18); the stats are read, never recomputed. v1.41: generic
// over any pre-computed series (scores, and the metric cards' raw values),
// with an optional reference-band lane (§10) and a free y axis.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import type { RangeKey, ScoreRange } from '../panels/scores'
import { fmtDay, fmtDelta, rangeLabel } from '../panels/scoresCopy'

// A series entry: its date and whatever pre-computed fields it carries.
type Entry = { date: string } & object

interface Props {
  series: Entry[]
  valueKey: string
  ranges: Record<RangeKey, ScoreRange>
  rangeOptions: RangeKey[]
  title: string
  color: string
  yMax?: number // fixed 0..yMax axis for scores; omitted = fitted to the data
  bandKey?: string // field holding [low, high] for a reference lane
  format: (v: number | null) => string
}

const read = (e: Entry, k: string) => (e as Record<string, unknown>)[k]

export default function TrendCard({
  series,
  valueKey,
  ranges,
  rangeOptions,
  title,
  color,
  yMax,
  bandKey,
  format,
}: Props) {
  const [range, setRange] = useState<RangeKey>(() => (ranges['30d'].locked ? 'all' : '30d'))
  const chartRef = useRef<HTMLDivElement | null>(null)
  const info = ranges[range]

  const inRange = useMemo(() => series.filter((e) => e.date >= info.start), [series, info.start])
  const points = useMemo(
    () => inRange.map((e) => [e.date, (read(e, valueKey) as number | null) ?? null] as [string, number | null]),
    [inRange, valueKey],
  )
  // lane = an invisible base at the low edge with the band's width stacked on it
  const lane = useMemo(() => {
    if (!bandKey) return null
    const b = inRange.map((e) => [e.date, (read(e, bandKey) as [number, number] | null) ?? null] as const)
    if (!b.some(([, v]) => v)) return null
    return {
      low: b.map(([d, v]) => [d, v ? v[0] : null]),
      width: b.map(([d, v]) => [d, v ? v[1] - v[0] : null]),
    }
  }, [inRange, bandKey])
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
        axisLabel: {
          color: '#9AA3AE',
          fontSize: 11,
          hideOverlap: true,
          formatter: '{d} {MMM}',
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        ...(yMax !== undefined ? { min: 0, max: yMax, interval: yMax === 21 ? 7 : 25 } : { scale: true }),
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
        ...(lane
          ? [
              {
                type: 'line',
                data: lane.low,
                stack: 'lane',
                symbol: 'none',
                lineStyle: { opacity: 0 },
                silent: true,
                tooltip: { show: false },
              },
              {
                type: 'line',
                data: lane.width,
                stack: 'lane',
                symbol: 'none',
                silent: true,
                tooltip: { show: false },
                lineStyle: { color, opacity: 0.35, width: 1 },
                areaStyle: { color, opacity: 0.16 },
              },
            ]
          : []),
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
          // no gradient under the line when a lane is drawn: one fill per chart
          areaStyle: lane
            ? undefined
            : {
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
  }, [points, lane, color, yMax, format])

  const stats = info.stats
  const delta = stats ? fmtDelta(stats.delta) : null
  return (
    <>
      <div className="seg" role="group" aria-label="Range">
        {rangeOptions.map((rk) => {
          const r = ranges[rk]
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
      {rangeOptions.some((rk) => ranges[rk].locked) && (
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
