// §8.3's "most important chart on the site" — shin vs rolling-7-day-km.
// This component only fetches, filters by the selected §9 range, and
// draws; every number and every state (band, understated_volume,
// range_start, coverage_by_range) was decided in compute/build_data.py /
// compute/metrics.py and shipped in the JSON (CLAUDE.md rule 3 — the
// frontend never aggregates, derives, or recomputes). Filtering the
// already-computed series to a date window is a client-side *selection*,
// not a derivation — see DASHBOARD_SPEC.md's v1.18 amendment.

import { useEffect, useMemo, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { buildShinVolumeOption, coverageText, minimumDataNote } from './shinVolumeChart'
import type { RangeKey, ShinSeriesResponse } from './shinSeries'
import RangeSelector from '../components/RangeSelector'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ShinSeriesResponse }

export default function ShinVolumePanel() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [selectedRange, setSelectedRange] = useState<RangeKey | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/data/shin_series.json')
      .then((res) => {
        if (!res.ok) throw new Error(`shin_series.json: ${res.status}`)
        return res.json() as Promise<ShinSeriesResponse>
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const data = state.status === 'ready' ? state.data : null
  const effectiveRange: RangeKey | null = data ? (selectedRange ?? data.default_range) : null

  // §9's range selector: filter the one already-computed series by date
  // (compute/build_data.py emitted it once, at the widest range the
  // selector will ever need — CLAUDE.md rule 3). ISO date strings sort
  // lexically the same as chronologically, so a string comparison is all
  // filtering needs.
  const filteredSeries = useMemo(() => {
    if (!data || !effectiveRange) return []
    const start = data.range_start[effectiveRange]
    return data.series.filter((d) => d.date >= start)
  }, [data, effectiveRange])

  useEffect(() => {
    if (!chartRef.current || filteredSeries.length === 0) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const option = buildShinVolumeOption(filteredSeries, { reducedMotion })

    // ECharts quirk (v1.22 amendment), confirmed against a live render,
    // not just the option object: a markArea on a category axis only
    // resolves its `xAxis` date bounds correctly when applied via a
    // *second*, separate setOption call, after the chart's axes already
    // exist. Included in the very first setOption call — even alongside
    // that same axis's own category data, in the same option object —
    // it silently renders across the full axis instead of the given
    // date range. So the understated-volume region (carried as
    // `markArea` on the first series) is stripped from the initial call
    // and merged back in immediately after.
    const series = option.series as Array<Record<string, unknown>> | undefined
    const understatedVolumeSeries = series?.find((s) => s.id === 'understated-volume')
    const markArea = understatedVolumeSeries?.markArea
    if (understatedVolumeSeries) delete understatedVolumeSeries.markArea

    const chart = echarts.init(chartRef.current)
    chart.setOption(option)
    if (markArea) {
      chart.setOption({ series: [{ id: 'understated-volume', markArea }] })
    }

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [filteredSeries])

  const coverage = data && effectiveRange ? data.coverage_by_range[effectiveRange] : null

  return (
    <section className="panel" aria-label="Shin score over 7-day rolling km">
      <h2 className="panel__title">Shin vs rolling 7-day km</h2>
      <p className="panel__subtitle">
        The line is a trailing 7-day sum — always 7 days wide, wherever it sits. The range below
        picks how much time is shown, not the width of that sum.
      </p>

      {state.status === 'loading' && <p className="status-text status-text--muted">Loading…</p>}
      {state.status === 'error' && (
        <p className="status-text status-text--error">Couldn't load shin_series.json.</p>
      )}

      {data && effectiveRange && (
        <>
          <RangeSelector options={data.range_options} selected={effectiveRange} onSelect={setSelectedRange} />
          <div
            className="panel__chart"
            ref={chartRef}
            role="img"
            aria-label="Shin score plotted against rolling 7-day kilometres"
          />
          {coverage && <p className="panel__coverage mono">{coverageText(coverage)}</p>}
          {coverage && minimumDataNote(coverage) && (
            <p className="panel__note">{minimumDataNote(coverage)}</p>
          )}
          <ul className="panel__legend">
            <li>
              <span className="legend-swatch legend-swatch--line" aria-hidden="true" />
              trailing 7-day running km (not weekly total)
            </li>
            <li>
              <span className="legend-swatch legend-swatch--solid" aria-hidden="true" />
              shin in band (0)
            </li>
            <li>
              <span className="legend-swatch legend-swatch--hollow" aria-hidden="true" />
              shin out of band (1–3)
            </li>
            <li>
              <span className="legend-swatch legend-swatch--hairline" aria-hidden="true" />
              not answered
            </li>
            <li>
              <span className="legend-swatch legend-swatch--hatch" aria-hidden="true" />
              volume floor, not measurement (pre-FR70)
            </li>
          </ul>
        </>
      )}
    </section>
  )
}
