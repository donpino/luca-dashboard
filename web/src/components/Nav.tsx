// Persistent primary navigation — §8.1 v1.35 floating tab bar: Today /
// Week / Block / Log as state-backed tabs, not routes (DASHBOARD_SPEC.md
// v1.25 amendment). Log took the disabled Lab slot in v1.42 and became a
// tab like the rest in v1.43 (the §4 single-app merge).

export type Tab = 'today' | 'week' | 'block' | 'log'

const ICONS: Record<Tab, string> = {
  today: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  week: 'M3 17l6-6 4 4 8-8M14 7h7v7',
  block: 'M3 18V8a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10M3 13h18M7 6V4M17 6V4',
  log: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'Week' },
  { key: 'block', label: 'Block' },
  { key: 'log', label: 'Log' },
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
    </nav>
  )
}
