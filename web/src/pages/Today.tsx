// §8.1 — default landing tab, the athlete's daily ten-second check.
// Fetches the one JSON file all three panels share (compute/build_data.py's
// build_today(), written to web/public/data/today.json) and hands each
// panel its own slice — every number and every decision (which flag fired,
// whether a band exists yet) was made in compute/metrics.py, never here
// (CLAUDE.md rule 3).

import { useEffect, useState } from 'react'
import FlagPanel from '../panels/FlagPanel'
import LastNightPanel from '../panels/LastNightPanel'
import type { TodayResponse } from '../panels/today'
import TodaySessionPanel from '../panels/TodaySessionPanel'

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: TodayResponse }

export default function Today() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    fetch('/data/today.json')
      .then((res) => {
        if (!res.ok) throw new Error(`today.json: ${res.status}`)
        return res.json() as Promise<TodayResponse>
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

  if (state.status === 'loading') {
    return <p className="status-text status-text--muted">Loading…</p>
  }
  if (state.status === 'error') {
    return <p className="status-text status-text--error">Couldn&rsquo;t load today.json.</p>
  }

  const { data } = state
  return (
    <>
      <LastNightPanel data={data.last_night} />
      <TodaySessionPanel session={data.session} />
      {/* §8.1: absent entirely when nothing qualifies — not an empty or
          "nothing to report" card. */}
      {data.flag && <FlagPanel flag={data.flag} />}
    </>
  )
}
