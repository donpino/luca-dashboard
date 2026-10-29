// §8.2 — "Session compliance grid", v1.40 styling. Presentational only —
// each day's done state comes straight off week.json's sessions[]
// (CLAUDE.md rule 3). Five states, each with its own non-colour encoding
// (§10): the sphere's fill — full / half / empty ring / dashed ring / no
// ring — plus its own text label. "No plan" (no row) is never "No".
// One colour for every state: red/green is Recovery's alone (§10 v1.35).

import LiquidSphere from '../components/LiquidSphere'
import { COLOR } from './scores'
import { complianceLabel, complianceState, weekdayLabel, type ComplianceState } from './weekPanelsCopy'
import type { WeekResponse } from './week'

const FILL: Partial<Record<ComplianceState, { level: number | null; color: string }>> = {
  yes: { level: 1, color: COLOR.accent },
  partial: { level: 0.5, color: COLOR.accent },
  no: { level: null, color: COLOR.accent },
}

export default function ComplianceGridPanel({ data }: { data: WeekResponse }) {
  return (
    <section className="card compliance" aria-label="Session compliance grid">
      <ol className="compliance__days">
        {data.sessions.map((day, i) => {
          const state = complianceState(day)
          const fill = FILL[state]
          return (
            <li key={day.date} className={`compliance__day compliance__day--${state}`}>
              <span className="label">{weekdayLabel(i).toUpperCase()}</span>
              <span className="compliance__date">{Number(day.date.slice(8))}</span>
              {fill ? (
                <LiquidSphere size={30} level={fill.level} color={fill.color} bubbles={false} />
              ) : (
                <span className="compliance__ring" style={state === 'pending' ? { borderColor: COLOR.accent } : undefined} />
              )}
              <span className="compliance__label">{complianceLabel(state)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
