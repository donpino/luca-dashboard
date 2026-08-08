interface Props {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}

// Entire row is the tap target (DASHBOARD_SPEC.md §8.5) — the <label>
// wraps everything, so tapping the label text also toggles the input.
export default function ToggleRow({ label, checked, onChange }: Props) {
  return (
    <label className="toggle-row">
      <span className="toggle-row__label">{label}</span>
      <input
        type="checkbox"
        className="toggle-row__input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
