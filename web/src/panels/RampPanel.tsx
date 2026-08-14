// §8.2 — "Ramp %". Presentational only — ramp_pct, actual_km, and
// prev_actual_km come straight off week.json (CLAUDE.md rule 3); this
// component reads weekPanelsCopy.ts's formatting and renders it.

import { rampDetailText, rampPctText, understatedVolumeNote } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function RampPanel({ data }: { data: WeekResponse }) {
  return (
    <section className="panel" aria-label="Ramp %">
      <h2 className="panel__title">Ramp %</h2>
      <p className="week-ramp__value mono">{rampPctText(data)}</p>
      <p className="week-ramp__detail">{rampDetailText(data)}</p>
      {data.understated_volume && <p className="panel__note">{understatedVolumeNote(data)}</p>}
    </section>
  )
}
