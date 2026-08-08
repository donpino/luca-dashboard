// Label only, not collapsible (DASHBOARD_SPEC.md §8.5).
export default function GroupHeader({ label }: { label: string }) {
  return <h2 className="group-header">{label}</h2>
}
