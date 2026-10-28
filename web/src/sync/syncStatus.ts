// "Sync now" — DASHBOARD_SPEC.md §4, §8.1, v1.36. Pure decision logic
// shared by the Worker (worker/index.ts: may a new sync start?) and the
// Today page (which phase is the button in?). No I/O here.

export const SYNC_COOLDOWN_MS = 10 * 60 * 1000

// The subset of a GitHub Actions workflow run this feature reads.
export interface RunInfo {
  status: 'queued' | 'in_progress' | 'completed' | string
  conclusion: 'success' | 'failure' | 'cancelled' | string | null
  created_at: string // ISO 8601
}

export interface SyncState {
  sync: RunInfo | null // latest manual (workflow_dispatch) Garmin sync run
  deploy: RunInfo | null // latest Deploy run chained after a sync
}

export type Dispatch = { ok: true } | { ok: false; reason: 'running' } | { ok: false; reason: 'cooldown'; retry_at: string }

function active(run: RunInfo | null): boolean {
  return run !== null && run.status !== 'completed'
}

/** Whether the Worker may dispatch a new manual sync now. One at a time,
 *  and at most one per 10 minutes — Garmin rate-limits repeated logins
 *  (the 429s of 26 Oct). */
export function decideDispatch(latest: RunInfo | null, nowMs: number): Dispatch {
  if (active(latest)) return { ok: false, reason: 'running' }
  if (latest) {
    const next = Date.parse(latest.created_at) + SYNC_COOLDOWN_MS
    if (nowMs < next) return { ok: false, reason: 'cooldown', retry_at: new Date(next).toISOString() }
  }
  return { ok: true }
}

export type Phase = 'idle' | 'syncing' | 'publishing' | 'done' | 'failed'

/** Where a manual sync started at `startedAtMs` has got to. The new data is
 *  live only once the Deploy chained after that sync has succeeded. */
export function syncPhase(state: SyncState, startedAtMs: number): Phase {
  const { sync, deploy } = state
  // allow GitHub a little clock skew between our POST and the run's timestamp
  const ours = (run: RunInfo | null) => run !== null && Date.parse(run.created_at) >= startedAtMs - 60_000
  if (!ours(sync)) return 'syncing' // dispatched, run not listed yet
  if (active(sync)) return 'syncing'
  if (sync!.conclusion !== 'success') return 'failed'
  if (!ours(deploy) || Date.parse(deploy!.created_at) < Date.parse(sync!.created_at)) return 'publishing'
  if (active(deploy)) return 'publishing'
  return deploy!.conclusion === 'success' ? 'done' : 'failed'
}
