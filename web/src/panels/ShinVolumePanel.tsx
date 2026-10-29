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
import PageLoader from '../components/PageLoader'
import RangeSelector from '../components/RangeSelector'
import { useJson } from '../components/useJson'

export default function ShinVolumePanel() {
  const state = useJson<ShinSeriesResponse>('shin_series.json')
  const [selectedRange, setSelectedRange] = useState<RangeKey | null>(null)
  const chartRef = useRef<HTMLDivElement | null>(null)

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

    const chart = echarts.init(chartRef.current)
    chart.setOption(option)

    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => {
      window.removeEventListener('resize', resize)
      chart.dispose()
    }
  }, [filteredSeries])

  const coverage = data && effectiveRange ? data.coverage_by_range[effectiveRange] : null

  return (
    <>
      <h2 className="section">SHIN VS ROLLING 7-DAY KM</h2>
      <p className="note">
        The line is a trailing 7-day sum — always 7 days wide, wherever it sits. The range picks how much time is
        shown, not the width of that sum.
      </p>

      {state.status === 'loading' && <PageLoader color="#D4A017" />}
      {state.status === 'error' && <p className="status-text status-text--error">Couldn't load shin_series.json.</p>}

      {data && effectiveRange && (
        <>
          <RangeSelector options={data.range_options} selected={effectiveRange} onSelect={setSelectedRange} />
          <section className="card trend" aria-label="Shin score over 7-day rolling km">
            <div className="trend__head">
              <span className="label">SHIN · KM</span>
              {coverage && <span className="note">{coverageText(coverage)}</span>}
            </div>
            <div
              className="shin-chart"
              ref={chartRef}
              role="img"
              aria-label="Shin score plotted against rolling 7-day kilometres"
            />
            <ul className="legend">
              <li>
                <span className="legend__swatch legend__swatch--line" aria-hidden="true" />
                trailing 7-day running km
              </li>
              <li>
                <span className="legend__swatch legend__swatch--solid" aria-hidden="true" />
                shin in band (0)
              </li>
              <li>
                <span className="legend__swatch legend__swatch--hollow" aria-hidden="true" />
                shin out of band (1–3)
              </li>
              <li>
                <span className="legend__swatch legend__swatch--hairline" aria-hidden="true" />
                not answered
              </li>
              <li>
                <span className="legend__swatch legend__swatch--hatch" aria-hidden="true" />
                volume floor, not measurement (pre-FR70)
              </li>
            </ul>
          </section>
          {coverage && minimumDataNote(coverage) && <p className="note">{minimumDataNote(coverage)}</p>}
        </>
      )}
    </>
  )
}
