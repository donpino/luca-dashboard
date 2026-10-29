// §8.2 — "Planned vs actual km" and "Ramp %", as v1.40 tiles. Presentational
// only — actual_km, planned_km and ramp_pct come straight off week.json
// (CLAUDE.md rule 3); weekPanelsCopy.ts formats them.

import { actualKmText, plannedKmText, rampDetailText, rampPctText, understatedVolumeNote } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function PlannedActualPanel({ data }: { data: WeekResponse }) {
  return (
    <>
      <div className="tiles" aria-label="Planned vs actual km">
        <div className="card tile">
          <span className="label">ACTUAL</span>
          <span className="tile__value">{actualKmText(data)}</span>
          <span className="row__sub">running only</span>
        </div>
        <div className="card tile">
          <span className="label">PLANNED</span>
          <span className="tile__value">{data.planned_km === null ? '—' : plannedKmText(data)}</span>
          <span className="row__sub">{data.planned_km === null ? 'no plan for this week' : 'from the plan'}</span>
        </div>
        <div className="card tile tile--wide" aria-label="Ramp %">
          <span className="label">RAMP</span>
          <span className="tile__value">{data.ramp_pct === null ? '—' : rampPctText(data)}</span>
          <span className="row__sub">{rampDetailText(data)}</span>
        </div>
      </div>
      {data.understated_volume && <p className="note">{understatedVolumeNote(data)}</p>}
    </>
  )
}
