// §8.1 v1.36 "Sync now" — POSTs /api/sync (worker/index.ts), then polls it
// every 10 s until the Deploy chained after that sync is live, and calls
// `onDone` so the page re-fetches its JSON. Which phase it is in comes from
// syncPhase() (src/sync/syncStatus.ts); this component only renders it.

import { useEffect, useRef, useState } from 'react'
import { syncPhase, type Phase, type SyncState } from '../sync/syncStatus'

const POLL_MS = 10_000
const GIVE_UP_MS = 10 * 60_000

type UiState = { phase: Phase | 'starting' } | { phase: 'blocked'; message: string }

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function SyncButton({ onDone }: { onDone: () => void }) {
  const [ui, setUi] = useState<UiState>({ phase: 'idle' })
  const startedAt = useRef<number | null>(null)

  useEffect(() => {
    if (ui.phase !== 'syncing' && ui.phase !== 'publishing') return
    const timer = window.setTimeout(async () => {
      const t0 = startedAt.current ?? Date.now()
      if (Date.now() - t0 > GIVE_UP_MS) return setUi({ phase: 'failed' })
      try {
        const res = await fetch('/api/sync', { cache: 'no-store' })
        if (!res.ok) throw new Error(String(res.status))
        const next = syncPhase((await res.json()) as SyncState, t0)
        if (next === 'done') onDone()
        setUi({ phase: next })
      } catch {
        setUi({ phase: ui.phase }) // transient error: poll again
      }
    }, POLL_MS)
    return () => window.clearTimeout(timer)
  }, [ui, onDone])

  async function start() {
    setUi({ phase: 'starting' })
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const body = await res.json()
      if (res.status === 202) {
        startedAt.current = Date.parse(body.started_at)
        return setUi({ phase: 'syncing' })
      }
      if (res.status === 409 && body.sync) {
        startedAt.current = Date.parse(body.sync.created_at) // join the run already going
        return setUi({ phase: 'syncing' })
      }
      if (res.status === 429) return setUi({ phase: 'blocked', message: `Next sync from ${clock(body.retry_at)}` })
      if (res.status === 503) return setUi({ phase: 'blocked', message: 'Sync isn’t set up yet' })
      setUi({ phase: 'failed' })
    } catch {
      setUi({ phase: 'failed' })
    }
  }

  const busy = ui.phase === 'starting' || ui.phase === 'syncing' || ui.phase === 'publishing'
  const label =
    ui.phase === 'blocked'
      ? ui.message
      : { idle: null, starting: 'Starting…', syncing: 'Syncing from Garmin…', publishing: 'Publishing…', done: 'Up to date', failed: 'Sync failed — try later' }[ui.phase]

  return (
    <>
      <button
        type="button"
        className={busy ? 'round-btn round-btn--spin' : 'round-btn'}
        onClick={start}
        disabled={busy}
        aria-label="Sync now"
        title="Sync now — last night, plus today so far"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {label && (
        <p className="sync-status" role="status">
          {label}
        </p>
      )}
    </>
  )
}
