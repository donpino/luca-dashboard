// Persistent primary navigation — Today / Week / Block / Log. The first
// three are state-backed tabs, not routes: switching them changes App.tsx's
// component state only, no URL change, no history entry (DASHBOARD_SPEC.md
// v1.25 amendment — supersedes the v1.9/v1.10 client-router plan for now).
// Log stays a plain anchor causing a full page load into the separate
// `web/log/index.html` build entry (§4's two-entry split, unchanged by this
// commit) — it must never become a state-backed tab, or the isolation the
// two-entry split exists for is gone in practice even though the build
// still technically keeps two bundles.

export type Tab = 'today' | 'week' | 'block'

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'block', label: 'Block' },
]

interface NavProps {
  active: Tab
  onSelect: (tab: Tab) => void
}

export default function Nav({ active, onSelect }: NavProps) {
  return (
    <nav className="nav" aria-label="Primary">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            className={isActive ? 'nav__item nav__item--active' : 'nav__item'}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(t.key)}
          >
            {t.label}
          </button>
        )
      })}
      {/* Full page load by design (§4) — not a tab, so no onClick/state. */}
      <a className="nav__item nav__item--log" href="/log/">
        Log <span aria-hidden="true">↗</span>
      </a>
    </nav>
  )
}
