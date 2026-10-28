// Persistent primary navigation — §8.1 v1.35 floating tab bar: Today /
// Week / Block, plus Lab rendered disabled until Phase 5 (§12). State-
// backed tabs, not routes (DASHBOARD_SPEC.md v1.25 amendment). /log is
// reached from the Today header's "+" — a plain anchor and full page load
// into the separate `web/log/index.html` build entry (§4's two-entry
// split); it must never become a state-backed tab.

export type Tab = 'today' | 'week' | 'block'

const ICONS: Record<Tab | 'lab', string> = {
  today: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  week: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  block: 'M3 18V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10M3 13h18M7 6V4M17 6V4',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3',
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'block', label: 'Block' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

interface NavProps {
  active: Tab
  onSelect: (tab: Tab) => void
}

export default function Nav({ active, onSelect }: NavProps) {
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => {
        const isActive = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            className={isActive ? 'tabbar__item tabbar__item--active' : 'tabbar__item'}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(t.key)}
          >
            <Icon d={ICONS[t.key]} />
            {t.label}
          </button>
        )
      })}
      <button type="button" className="tabbar__item" disabled title="Unlocks in Phase 5">
        <Icon d={ICONS.lab} />
        Lab
      </button>
    </nav>
  )
}
