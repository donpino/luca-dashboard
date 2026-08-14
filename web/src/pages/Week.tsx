// §8.2 — the coach surface. "Generate check-in" is built (v1.28); the
// other six panels stay unbuilt shells until their own commits, same
// nav-shell convention as the rest of this page (v1.25).
import { useEffect, useState } from 'react'
import CheckinPanel from '../panels/CheckinPanel'
import EmptyPanel from '../panels/EmptyPanel'
import type { WeekResponse } from '../panels/week'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: WeekResponse }

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
      <EmptyPanel title="Planned vs actual km" />
      <EmptyPanel title="Ramp %" />
      <EmptyPanel title="Session compliance grid" />
      <EmptyPanel title="Easy-band compliance" />
      <EmptyPanel title="Medio control" />
      <EmptyPanel title="Wellness summary" />
      {state.status === 'loading' && (
        <section className="panel" aria-label="Generate check-in">
          <h2 className="panel__title">Generate check-in</h2>
          <p className="status-text status-text--muted">Loading…</p>
        </section>
      )}
      {state.status === 'error' && (
        <section className="panel" aria-label="Generate check-in">
          <h2 className="panel__title">Generate check-in</h2>
          <p className="status-text status-text--error">Couldn&rsquo;t load week.json.</p>
        </section>
      )}
      {state.status === 'ready' && <CheckinPanel data={state.data} />}
    </>
  )
}
