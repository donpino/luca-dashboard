// Public dashboard. Today / Week / Block are tabs backed by React state,
// not routes — switching tabs changes this component's state only, the URL
// never changes and no history entry is pushed (DASHBOARD_SPEC.md v1.25
// amendment, superseding the v1.9/v1.10 client-router plan for now: a URL
// route would need the host to serve index.html for unknown paths, and a
// mistake there is an unfixable 404 during an unmaintained window). Lab
// still doesn't exist (§12, Phase 5+). This bundle must never import
// @supabase/supabase-js or anything under src/log/ — see CLAUDE.md and
// DASHBOARD_SPEC.md §4 on bundle isolation; Nav's Log item is a plain
// anchor for exactly this reason, not a fourth tab.
import { useState } from 'react'
import Nav, { type Tab } from './components/Nav'
import Today from './pages/Today'
import Week from './pages/Week'
import Block from './pages/Block'

export default function App() {
  const [tab, setTab] = useState<Tab>('today')

  return (
    <div className="app-shell">
      <Nav active={tab} onSelect={setTab} />
      <main className="app-main">
        <div className="page">
          <h1>Luca — Training Dashboard</h1>
          {tab === 'today' && <Today />}
          {tab === 'week' && <Week />}
          {tab === 'block' && <Block />}
        </div>
      </main>
    </div>
  )
}
