// §8.2 — the coach surface. Planned vs actual km, Ramp %, Session
// compliance grid, and Wellness summary are built (v1.33), reading
// week.json directly (CLAUDE.md rule 3). Easy-band compliance and Medio
// control stay EmptyPanels — they need the laps table (Phase 1.5), which
// does not exist yet. Generate check-in was built in v1.28.
import { useEffect, useState } from 'react'
import CheckinPanel from '../panels/CheckinPanel'
import ComplianceGridPanel from '../panels/ComplianceGridPanel'
import EmptyPanel from '../panels/EmptyPanel'
import PlannedActualPanel from '../panels/PlannedActualPanel'
import RampPanel from '../panels/RampPanel'
import WellnessPanel from '../panels/WellnessPanel'
import type { WeekResponse } from '../panels/week'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: WeekResponse }

// Shared loading/error shell for the four panels below that need
// week.json before they can render anything — same copy the check-in
// panel's own loading/error states already used.
function DataPanelStatus({
  title,
  status,
}: {
  title: string
  status: 'loading' | 'error'
}) {
  return (
    <section className="panel" aria-label={title}>
      <h2 className="panel__title">{title}</h2>
      {status === 'loading' ? (
        <p className="status-text status-text--muted">Loading…</p>
      ) : (
        <p className="status-text status-text--error">Couldn&rsquo;t load week.json.</p>
      )}
    </section>
  )
}

export default function Week() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/data/week.json')
      .then((res) => {
        if (!res.ok) throw new Error(`week.json: ${res.status}`)
        return res.json() as Promise<WeekResponse>
      })
      .then((data) => {
        if (!cancelled) setState({ status: 'ready', data })
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <>
      <div className="week-grid">
        {state.status === 'ready' ? (
          <>
            <PlannedActualPanel data={state.data} />
            <RampPanel data={state.data} />
          </>
        ) : (
          <>
            <DataPanelStatus title="Planned vs actual km" status={state.status} />
            <DataPanelStatus title="Ramp %" status={state.status} />
          </>
        )}
      </div>
      {state.status === 'ready' ? (
        <ComplianceGridPanel data={state.data} />
      ) : (
        <DataPanelStatus title="Session compliance grid" status={state.status} />
      )}
      <div className="week-grid">
        <EmptyPanel title="Easy-band compliance" />
        <EmptyPanel title="Medio control" />
      </div>
      {state.status === 'ready' ? (
        <WellnessPanel data={state.data} />
      ) : (
        <DataPanelStatus title="Wellness summary" status={state.status} />
      )}
      {state.status === 'ready' ? (
        <CheckinPanel data={state.data} />
      ) : (
        <DataPanelStatus title="Generate check-in" status={state.status} />
      )}
    </>
  )
}
