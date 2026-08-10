// Pure ECharts option builder for the §8.3 shin-vs-rolling-7-day-km
// panel — "the most important chart on the site." Kept side-effect free
// (no DOM, no echarts.init) so the rendering logic is unit-testable the
// same way compute/metrics.py's functions are (CLAUDE.md "no metric
// ships untested," extended here to the render layer).
//
// This module reads `band` and `understated_volume` off each day exactly
// as compute/metrics.py's shin_series() computed them — it never
// recomputes the in-band threshold or the understated-volume cutoff
// (CLAUDE.md rule 3, DASHBOARD_SPEC.md §7).

import type { EChartsOption } from 'echarts'
import type { ShinSeriesDay, ShinSeriesResponse } from './shinSeries'

// §10 palette — literal values, not CSS var() strings, because these are
// consumed by an off-DOM canvas renderer (echarts), not the stylesheet.
const AZZURRO = '#3E8FD6'
const TEXT = '#E6EAF0'
const MUTED = '#8794A6'
const LINE = '#232B38'

// v1.7's binding understated-volume treatment (§8.3), chosen here as a
// diagonal-hatch fill (an inline SVG tile, not a solid colour) so it
// reads as "uncertain" rather than as the reference-band lane fill used
// elsewhere — recorded in DASHBOARD_SPEC.md's v1.16 amendment. A data
// URI, not a canvas pattern, so this stays a plain string the option
// builder can produce with no DOM (kept testable off-browser, like the
// rest of this module).
const UNDERSTATED_VOLUME_HATCH = {
  image:
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="6" height="6">' +
        '<path d="M-1,1 L1,-1 M0,6 L6,0 M5,7 L7,5" stroke="#E6EAF0" stroke-width="1" opacity="0.35"/>' +
        '</svg>',
    ),
  repeat: 'repeat' as const,
}

// §10: "solid marker = in band, hollow marker = out of band," and the
// shin-only third state, "absent — hairline outline, no fill, sitting on
// the axis." Red/green never used for in/out (§10) — fill-vs-hollow is
// the entire encoding, so both states share the same stroke colour.
function shinItemStyle(band: ShinSeriesDay['band']) {
  if (band === 'in_band') {
    return { color: TEXT, borderColor: TEXT, borderWidth: 1 }
  }
  // out_of_band — hollow: no fill, visible stroke.
  return { color: 'transparent', borderColor: TEXT, borderWidth: 2 }
}

// Below this many days in range, a rolling-7-day line spans little more
// than its own window and can read as a multi-day trend when it is
// really one or two readings. Chosen, not spec-given (task: "if that
// needs a minimum-data state, say what you chose and record it") —
// recorded in DASHBOARD_SPEC.md's v1.16 amendment. The panel still
// renders in full below this line; it is a caption, not a lock (Lab-page
// gating, CLAUDE.md rule 7, applies only to §8.4, not this panel).
export const MIN_RANGE_DAYS_FOR_TREND = 7

export function coverageText(coverage: ShinSeriesResponse['coverage']): string {
  return `${coverage.answered} answered / ${coverage.total} days in range`
}

export function minimumDataNote(coverage: ShinSeriesResponse['coverage']): string | null {
  if (coverage.total >= MIN_RANGE_DAYS_FOR_TREND) {
    return null
  }
  return `early days — range is shorter than one rolling 7-day window (${coverage.total} day${coverage.total === 1 ? '' : 's'})`
}

function formatAxisDate(iso: string): string {
  // "MM-DD" — IBM Plex Mono figures, no year (§10: mono for all figures).
  return iso.slice(5)
}

export function buildShinVolumeOption(
  data: ShinSeriesResponse,
  opts: { reducedMotion: boolean } = { reducedMotion: false },
): EChartsOption {
  const { series } = data
  const categories = series.map((d) => d.date)

  const kmData = series.map((d) => d.rolling_7d_km)

  // v1.7's binding rendering requirement (§8.3): the understated-volume
  // portion gets a treatment distinct from the reference-band lane fill
  // used elsewhere — chosen here as a hatched (decal) area under the km
  // line, present only where understated_volume is true, recorded in
  // DASHBOARD_SPEC.md's v1.16 amendment. The measured portion carries no
  // area fill at all: shin has no continuous reference band (§10), so
  // there is no "lane" for this metric to confuse the hatch with.
  const understatedAreaData = series.map((d) => (d.understated_volume ? d.rolling_7d_km : null))

  const shinLineData = series.map((d) =>
    d.shin === null
      ? null
      : {
          value: d.shin,
          itemStyle: shinItemStyle(d.band),
        },
  )

  // §10's third marker state, drawn as its own series so it is never
  // connected into the shin step line (a gap, not a value — §7's null
  // rule). Sits at 0 on the shin axis ("on the axis"), hairline outline,
  // no fill — distinct from a solid in-band 0 at the same position.
  const notAnsweredData = series.map((d) => (d.band === 'not_answered' ? 0 : null))

  return {
    animation: !opts.reducedMotion,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: TEXT },
    grid: { left: 48, right: 48, top: 24, bottom: 40 },
    xAxis: {
      type: 'category',
      data: categories,
      axisLine: { lineStyle: { color: LINE } },
      axisLabel: { color: MUTED, formatter: formatAxisDate },
      axisTick: { show: false },
    },
    yAxis: [
      {
        // rolling_7d_km — continuous, left axis.
        type: 'value',
        name: 'km',
        nameTextStyle: { color: MUTED },
        axisLine: { show: true, lineStyle: { color: LINE } },
        axisLabel: { color: MUTED },
        splitLine: { lineStyle: { color: LINE } },
      },
      {
        // shin — 0-3 ordinal, right axis, fixed so the step series'
        // height stays comparable across ranges (§7: raw ordinal still
        // drives step height; only marker fill state reads `band`).
        type: 'value',
        name: 'shin',
        min: 0,
        max: 3,
        interval: 1,
        nameTextStyle: { color: MUTED },
        axisLine: { show: true, lineStyle: { color: LINE } },
        axisLabel: { color: MUTED },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        id: 'understated-volume',
        name: 'understated volume',
        type: 'line',
        yAxisIndex: 0,
        data: understatedAreaData,
        connectNulls: false,
        showSymbol: false,
        silent: true,
        z: 1,
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: UNDERSTATED_VOLUME_HATCH,
        },
      },
      {
        id: 'rolling-7d-km',
        name: 'rolling 7d km',
        type: 'line',
        yAxisIndex: 0,
        data: kmData,
        symbol: 'none',
        smooth: false,
        z: 3,
        lineStyle: { color: AZZURRO, width: 2 },
      },
      {
        id: 'shin',
        name: 'shin',
        type: 'line',
        step: 'end',
        yAxisIndex: 1,
        data: shinLineData,
        connectNulls: false,
        symbolSize: 9,
        z: 4,
        lineStyle: { color: MUTED, width: 1 },
      },
      {
        id: 'shin-not-answered',
        name: 'not answered',
        type: 'scatter',
        yAxisIndex: 1,
        data: notAnsweredData,
        symbolSize: 9,
        z: 4,
        itemStyle: { color: 'transparent', borderColor: MUTED, borderWidth: 1 },
      },
    ],
  }
}
