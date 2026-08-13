// §8.1 Panel 1 — "Last night". Presentational only: every value and every
// date comes straight from web/public/data/today.json's last_night field
// (compute/metrics.py's last_night(), CLAUDE.md rule 3) — this component
// formats, it does not compute. No band is drawn here — see noBandNote's
// docstring and DASHBOARD_SPEC.md's v1.26 amendment for why.

import { formatMinutes, formatShortDate, formatUnit, noBandNote } from './lastNightCopy'
import type { LastNight } from './today'

export default function LastNightPanel({ data }: { data: LastNight | null }) {
  return (
    <section className="panel" aria-label="Last night">
      <h2 className="panel__title">Last night</h2>
      {data === null ? (
        <p className="status-text status-text--muted">No biometrics recorded yet.</p>
      ) : (
        <>
          <ul className="last-night__values">
            <li>
              <span className="last-night__label">Sleep</span>
              <span className="mono">{formatMinutes(data.sleep_total_min)}</span>
            </li>
            <li>
              <span className="last-night__label">RHR</span>
              <span className="mono">{formatUnit(data.rhr, ' bpm')}</span>
            </li>
            <li>
              <span className="last-night__label">HRV</span>
              <span className="mono">{formatUnit(data.hrv_overnight, ' ms')}</span>
            </li>
          </ul>

          {data.values.length > 1 && (
            <table className="last-night__history mono">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sleep</th>
                  <th>RHR</th>
                  <th>HRV</th>
                </tr>
              </thead>
              <tbody>
                {data.values.map((night) => (
                  <tr key={night.date}>
                    <td>{formatShortDate(night.date)}</td>
                    <td>{formatMinutes(night.sleep_total_min)}</td>
                    <td>{formatUnit(night.rhr, '')}</td>
                    <td>{formatUnit(night.hrv_overnight, '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="panel__note">{noBandNote(data)}</p>
        </>
      )}
    </section>
  )
}
