// §8.3's "most important chart on the site" — shin vs rolling-7-day-km.
// This component only fetches and draws; every number and every state
// (band, understated_volume) was decided in compute/metrics.py and
// shipped in the JSON (CLAUDE.md rule 3 — the frontend never
// aggregates, derives, or recomputes).

import { useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts'
import { buildShinVolumeOption, coverageText, minimumDataNote } from './shinVolumeChart'
import type { ShinSeriesResponse } from './shinSeries'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: ShinSeriesResponse }

export default function ShinVolumePanel() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
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

  useEffect(() => {
    if (state.status !== 'ready' || !chartRef.current) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const chart = echarts.init(chartRef.current)
    chart.setOption(buildShinVolumeOption(state.data, { reducedMotion }))

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [state])

  return (
    <section className="panel" aria-label="Shin score over 7-day rolling km">
      <h2 className="panel__title">Shin vs rolling 7-day km</h2>

      {state.status === 'loading' && <p className="status-text status-text--muted">Loading…</p>}
      {state.status === 'error' && (
        <p className="status-text status-text--error">Couldn't load shin_series.json.</p>
      )}

      {state.status === 'ready' && (
        <>
          <div className="panel__chart" ref={chartRef} role="img" aria-label="Shin score plotted against rolling 7-day kilometres" />
          <p className="panel__coverage mono">{coverageText(state.data.coverage)}</p>
          {minimumDataNote(state.data.coverage) && (
            <p className="panel__note">{minimumDataNote(state.data.coverage)}</p>
          )}
          <ul className="panel__legend">
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
