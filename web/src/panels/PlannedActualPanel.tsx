// §8.2 — "Planned vs actual km". Presentational only — actual_km and
// planned_km come straight off week.json (CLAUDE.md rule 3); this
// component reads weekPanelsCopy.ts's formatting and renders it.

import { actualKmText, plannedKmText, understatedVolumeNote } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function PlannedActualPanel({ data }: { data: WeekResponse }) {
  return (
    <section className="panel" aria-label="Planned vs actual km">
      <h2 className="panel__title">Planned vs actual km</h2>
      <dl className="week-stat-pair">
        <div className="week-stat-pair__item">
          <dt>Actual</dt>
          <dd className="mono">{actualKmText(data)}</dd>
        </div>
        <div className="week-stat-pair__item">
          <dt>Planned</dt>
          <dd className="mono">{plannedKmText(data)}</dd>
        </div>
      </dl>
      {data.understated_volume && <p className="panel__note">{understatedVolumeNote(data)}</p>}
    </section>
  )
}
