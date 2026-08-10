// Public dashboard. Today/Week/Lab and full Block land in a later phase
// (DASHBOARD_SPEC.md §12, Phase 1+) — this route carries only the §8.3
// shin panel for now, no nav and no router (v1.10, still deferred). This
// bundle must never import @supabase/supabase-js or anything under
// src/log/ — see CLAUDE.md and DASHBOARD_SPEC.md §4 on bundle isolation.
import ShinVolumePanel from './panels/ShinVolumePanel'

export default function App() {
  return (
    <div className="page">
      <h1>Luca — Training Dashboard</h1>
      <ShinVolumePanel />
    </div>
  )
}
