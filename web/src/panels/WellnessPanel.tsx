// §8.2 — "Wellness summary", v1.40 card rows. Presentational only — every
// mean, count and shin_max comes straight off week.json's wellness object
// (CLAUDE.md rule 3). Each mean keeps its own night count beside it, so a
// mean over a few nights never looks like a mean over 7 (§8.2 v1.33).

import MetricRow from '../components/MetricRow'
import { COLOR } from './scores'
import { hrvMeanText, nightCountText, rhrMeanText, shinCoverageText, shinMaxText, sleepMeanText } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function WellnessPanel({ data }: { data: WeekResponse }) {
  const w = data.wellness
  return (
    <div className="rows" aria-label="Wellness summary">
      <MetricRow name="SLEEP" sub={nightCountText(w.sleep_n)} value={sleepMeanText(w)} color={COLOR.sleep} />
      <MetricRow name="RESTING HR" sub={nightCountText(w.rhr_n)} value={rhrMeanText(w)} color={COLOR.rhr} />
      <MetricRow name="HRV" sub={nightCountText(w.hrv_n)} value={hrvMeanText(w)} color={COLOR.strain} />
      <MetricRow name="SHIN" sub={shinCoverageText(w)} value={shinMaxText(w)} color={COLOR.amber} />
    </div>
  )
}
