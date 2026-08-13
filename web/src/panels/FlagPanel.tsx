// §8.1 Panel 3 — "Flag". At most one, and this component is only ever
// mounted when Today.tsx already has a non-null flag — "absent entirely,
// not empty" is enforced by the caller, not by an empty-state branch
// here. Which rule fired and its precedence were decided in
// compute/metrics.py's today_flag() (CLAUDE.md rule 3); this only
// formats it (§10: amber, used sparingly, never as a verdict — no
// red/green here).

import { flagLabel, flagText } from './flagCopy'
import type { TodayFlag } from './today'

export default function FlagPanel({ flag }: { flag: TodayFlag }) {
  return (
    <section className="panel panel--flag" aria-label="Flag">
      <h2 className="panel__title">Flag</h2>
      <p className="flag-panel__label">{flagLabel(flag)}</p>
      <p className="flag-panel__text mono">{flagText(flag)}</p>
    </section>
  )
}
