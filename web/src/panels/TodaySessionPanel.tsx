// §8.1 Panel 2 — "Today's session". No row for today is a real state
// (§8.1), rendered plainly rather than as an empty or error panel.

import type { TodaySession } from './today'

export default function TodaySessionPanel({ session }: { session: TodaySession | null }) {
  return (
    <section className="panel" aria-label="Today's session">
      <h2 className="panel__title">Today&rsquo;s session</h2>
      {session === null ? (
        <p className="status-text status-text--muted">No session logged for today.</p>
      ) : (
        <dl className="session-detail">
          <div className="session-detail__row">
            <dt>Type</dt>
            <dd>{session.session_type ?? '—'}</dd>
          </div>
          <div className="session-detail__row">
            <dt>Purpose</dt>
            <dd>{session.purpose ?? '—'}</dd>
          </div>
          <div className="session-detail__row">
            <dt>Prescription</dt>
            <dd>{session.prescription ?? '—'}</dd>
          </div>
          <div className="session-detail__row">
            <dt>Done</dt>
            <dd>{session.done ?? '—'}</dd>
          </div>
        </dl>
      )}
    </section>
  )
}
