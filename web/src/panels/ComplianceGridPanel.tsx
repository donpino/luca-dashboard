// §8.2 — "Session compliance grid". Presentational only — each day's
// session_type/done come straight off week.json's sessions[] (CLAUDE.md
// rule 3). Four logged states (Yes/Partial/No/Pending) plus a fifth,
// distinct "no row" state (an absent plan, never collapsed into "No" —
// §8.2 v1.33) are each given their own non-colour marker treatment
// (solid/hatch/hollow/dashed/blank) and their own text label, so the
// grid reads without colour per §10.

import { complianceLabel, complianceState, weekdayLabel } from './weekPanelsCopy'
import type { WeekResponse } from './week'

export default function ComplianceGridPanel({ data }: { data: WeekResponse }) {
  return (
    <section className="panel" aria-label="Session compliance grid">
      <h2 className="panel__title">Session compliance grid</h2>
      <ol className="compliance-grid">
        {data.sessions.map((day, i) => {
          const state = complianceState(day)
          return (
            <li key={day.date} className={`compliance-cell compliance-cell--${state}`}>
              <span className="compliance-cell__day">{weekdayLabel(i)}</span>
              <span className="compliance-cell__date mono">{day.date.slice(5)}</span>
              <span className="compliance-cell__marker" aria-hidden="true" />
              <span className="compliance-cell__label">{complianceLabel(state)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
