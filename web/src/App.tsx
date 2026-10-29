// Public dashboard. Today / Week / Block are tabs backed by React state,
// not routes — switching tabs changes this component's state only, the URL
// never changes and no history entry is pushed (DASHBOARD_SPEC.md v1.25
// amendment, superseding the v1.9/v1.10 client-router plan for now: a URL
// route would need the host to serve index.html for unknown paths, and a
// mistake there is an unfixable 404 during an unmaintained window). The
// v1.35 score detail pages follow the same rule: `detail` state on top of
// the Today tab. Lab still doesn't exist (§12, Phase 5+) and renders as a
// disabled tab. This bundle must never import @supabase/supabase-js or
// anything under src/log/ — see CLAUDE.md and DASHBOARD_SPEC.md §4 on
// bundle isolation; the Today header's "+" is a plain anchor to /log/ for
// exactly this reason.
import { useEffect, useState } from 'react'
import Nav, { type Tab } from './components/Nav'
import Today from './pages/Today'
import Week from './pages/Week'
import Block from './pages/Block'
import ScoreDetail from './pages/ScoreDetail'
import MetricDetail from './pages/MetricDetail'
import type { MetricKey } from './panels/metrics'
import type { ScoreKey } from './panels/scores'
import { prefetchJson } from './components/useJson'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')
  const [detail, setDetail] = useState<ScoreKey | null>(null)
  const [metric, setMetric] = useState<MetricKey | null>(null) // v1.41 card detail
  // v1.39: the day Today and the detail pages show; null = today (live)
  const [day, setDay] = useState<string | null>(null)

  // v1.40: warm every tab's file once, so switching tabs never waits
  useEffect(() => {
    for (const f of ['today.json', 'scores.json', 'metrics.json', 'week.json', 'shin_series.json']) prefetchJson(f)
  }, [])

  const select = (next: Tab) => {
    setDetail(null)
    setMetric(null)
    setTab(next)
    window.scrollTo(0, 0)
  }
  const open = (key: ScoreKey) => {
    setDetail(key)
    window.scrollTo(0, 0)
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        <div className="page">
          {tab === 'today' && detail === null && metric === null && (
            <Today
              day={day}
              onDay={setDay}
              onOpen={open}
              onMetric={(k) => {
                setMetric(k)
                window.scrollTo(0, 0)
              }}
              onShin={() => select('block')}
            />
          )}
          {tab === 'today' && detail !== null && <ScoreDetail kind={detail} day={day} onBack={() => setDetail(null)} />}
          {tab === 'today' && metric !== null && <MetricDetail kind={metric} day={day} onBack={() => setMetric(null)} />}
          {tab === 'week' && <Week />}
          {tab === 'block' && <Block />}
        </div>
      </main>
      <Nav active={tab} onSelect={select} />
    </div>
  )
}
