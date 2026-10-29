// §8.2 — the coach surface, in the §10 v1.35 visual system since v1.40.
// Planned vs actual km and Ramp %, the session compliance grid, the
// wellness summary and Generate check-in read week.json directly
// (CLAUDE.md rule 3). Easy-band compliance and Medio control need the
// laps table (Phase 1.5) and say so — an unbuilt panel says it is unbuilt.
import PageLoader from '../components/PageLoader'
import { useJson } from '../components/useJson'
import CheckinPanel from '../panels/CheckinPanel'
import ComplianceGridPanel from '../panels/ComplianceGridPanel'
import PlannedActualPanel from '../panels/PlannedActualPanel'
import WellnessPanel from '../panels/WellnessPanel'
import { fmtDay } from '../panels/scoresCopy'
import type { WeekResponse } from '../panels/week'

export default function Week() {
  const state = useJson<WeekResponse>('week.json')
  const data = state.status === 'ready' ? state.data : null

  return (
    <div className="screen screen--week">
      <header className="detail-head">
        <h1 className="detail-head__title">Week</h1>
        <p className="detail-head__sub">
          {data ? `${data.week_label ? `${data.week_label} · ` : ''}${fmtDay(data.week_start)} – ${fmtDay(data.week_end)}` : ' '}
        </p>
      </header>

      {state.status === 'loading' && <PageLoader />}
      {state.status === 'error' && <p className="status-text status-text--error">Couldn&rsquo;t load week.json.</p>}

      {data && (
        <>
          <h2 className="section">VOLUME</h2>
          <PlannedActualPanel data={data} />

          <h2 className="section">SESSIONS</h2>
          <ComplianceGridPanel data={data} />

          <h2 className="section">WELLNESS</h2>
          <WellnessPanel data={data} />

          <h2 className="section">NOT BUILT YET</h2>
          <section className="card">
            <p className="row__name">EASY-BAND COMPLIANCE · MEDIO CONTROL</p>
            <p className="note">Both need per-lap data, which arrives with the laps table (Phase 1.5).</p>
          </section>

          <h2 className="section">CHECK-IN</h2>
          <CheckinPanel data={data} />
        </>
      )}
    </div>
  )
}
