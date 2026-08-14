// §8.2 — "Wellness summary". Presentational only — every mean, count,
// and shin_max comes straight off week.json's wellness object (CLAUDE.md
// rule 3). Each mean is shown with its own night count so a mean over a
// few nights never looks like a mean over 7; shin_max is shown with
// coverage as answered/7. No understated-volume caveat here — that flag
// describes the volume/ramp figures only (§8.2 v1.33).

import { hrvMeanText, nightCountText, rhrMeanText, shinCoverageText, shinMaxText, sleepMeanText } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function WellnessPanel({ data }: { data: WeekResponse }) {
  const w = data.wellness
  return (
    <section className="panel" aria-label="Wellness summary">
      <h2 className="panel__title">Wellness summary</h2>
      <dl className="week-wellness-grid">
        <div className="week-wellness-stat">
          <dt className="week-wellness-stat__label">Sleep</dt>
          <dd className="week-wellness-stat__value mono">{sleepMeanText(w)}</dd>
          <dd className="week-wellness-stat__coverage">{nightCountText(w.sleep_n)}</dd>
        </div>
        <div className="week-wellness-stat">
          <dt className="week-wellness-stat__label">RHR</dt>
          <dd className="week-wellness-stat__value mono">{rhrMeanText(w)}</dd>
          <dd className="week-wellness-stat__coverage">{nightCountText(w.rhr_n)}</dd>
        </div>
        <div className="week-wellness-stat">
          <dt className="week-wellness-stat__label">HRV</dt>
          <dd className="week-wellness-stat__value mono">{hrvMeanText(w)}</dd>
          <dd className="week-wellness-stat__coverage">{nightCountText(w.hrv_n)}</dd>
        </div>
        <div className="week-wellness-stat">
          <dt className="week-wellness-stat__label">Shin</dt>
          <dd className="week-wellness-stat__value mono">{shinMaxText(w)}</dd>
          <dd className="week-wellness-stat__coverage">{shinCoverageText(w)}</dd>
        </div>
      </dl>
    </section>
  )
}
