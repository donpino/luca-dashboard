// §8.2 — the coach surface, in the §10 v1.35 visual system since v1.40.
// Planned vs actual km and Ramp %, the session compliance grid, the
// wellness summary and Generate check-in read week.json directly
// (CLAUDE.md rule 3). Easy-band compliance and Medio control need the
// laps table (Phase 1.5) and say so — an unbuilt panel says it is unbuilt.
// v1.42: tapping the title opens the week picker; a past week reads
// weeks/<monday>.json, built by the same week_checkin() as on its Sunday.
import { useState } from 'react'
import DayPicker from '../components/DayPicker'
import PageLoader from '../components/PageLoader'
import { useJson } from '../components/useJson'
import CheckinPanel from '../panels/CheckinPanel'
import ComplianceGridPanel from '../panels/ComplianceGridPanel'
import PlannedActualPanel from '../panels/PlannedActualPanel'
import WellnessPanel from '../panels/WellnessPanel'
import { fmtDay } from '../panels/scoresCopy'
import type { WeekResponse } from '../panels/week'

function Chevron() {
  return (
    <svg className="chev" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
      <path d="m9 18 6-6-6-6" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface WeekProps {
  week: string | null // a past week's Monday; null = this week (live)
  onWeek: (monday: string | null) => void
}

export default function Week({ week, onWeek }: WeekProps) {
  const [picking, setPicking] = useState(false)
  const state = useJson<WeekResponse>(week ? `weeks/${week}.json` : 'week.json')
  const data = state.status === 'ready' ? state.data : null

  if (picking)
    return (
      <div className="screen screen--week">
        <DayPicker
          mode="week"
          selected={week}
          onPick={(m) => {
            setPicking(false)
            onWeek(m)
          }}
          onClose={() => setPicking(false)}
        />
      </div>
    )

  return (
    <div className="screen screen--week">
      <header className="today-head">
        <div>
          <button type="button" className="today-head__pick" onClick={() => setPicking(true)} aria-label="Choose a week">
            <h1 className="today-head__title">
              {week && data ? `${fmtDay(data.week_start)} – ${fmtDay(data.week_end)}` : 'Week'}
              <Chevron />
            </h1>
          </button>
          <p className="today-head__date">
            {data
              ? week
                ? (data.week_label ?? 'Monday to Sunday')
                : `${data.week_label ? `${data.week_label} · ` : ''}${fmtDay(data.week_start)} – ${fmtDay(data.week_end)}`
              : ' '}
          </p>
        </div>
        {week && (
          <button type="button" className="chip chip--on" onClick={() => onWeek(null)}>
            BACK TO THIS WEEK
          </button>
        )}
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
