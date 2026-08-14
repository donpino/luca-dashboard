// §8.2 — "Generate check-in": the Week page's terminating action (§3.3).
// Presentational only — every number came from week.json via
// compute/metrics.py's week_checkin() (CLAUDE.md rule 3); checkinCopy.ts
// turns that dict into the Markdown string below, this component only
// renders it and wires the Copy button.

import { useState } from 'react'
import { checkinText } from './checkinCopy'
import type { WeekResponse } from './week'

export default function CheckinPanel({ data }: { data: WeekResponse }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const text = checkinText(data)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyState('copied')
    } catch {
      // Clipboard write failed (permissions, insecure context, etc.) — the
      // text stays selectable in the <pre> below regardless, so this
      // never leaves Luca with no way to get the block out. Never a
      // silent failure (work order, §8.2).
      setCopyState('error')
    }
  }

  return (
    <section className="panel" aria-label="Generate check-in">
      <h2 className="panel__title">Generate check-in</h2>
      <pre className="checkin-block mono">{text}</pre>
      <button type="button" className="checkin-block__copy-btn" onClick={handleCopy}>
        {copyState === 'copied' ? 'Copied' : 'Copy'}
      </button>
      {copyState === 'error' && (
        <p className="status-text status-text--error">
          Couldn&rsquo;t copy automatically — select the text above and copy it manually.
        </p>
      )}
    </section>
  )
}
