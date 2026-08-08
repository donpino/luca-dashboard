const STEP = 0.5
const MIN = 0
const MAX = 16

interface Props {
  value: number | null
  touched: boolean
  onChange: (next: number) => void
  onClear: () => void
}

function clamp(n: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(n * 2) / 2))
}

// No text input at all, so there's no numeric keyboard to suppress
// (DASHBOARD_SPEC.md §8.5). Untouched shows "—", never 0 — 0 is a real
// value once touched (§5). Clear returns to untouched so one accidental tap
// on + or − can't permanently turn an unlogged day into a real 0 — 0 is
// meaningful in term time, the same null-vs-zero failure as `shin`.
export default function StudyHoursStepper({ value, touched, onChange, onClear }: Props) {
  const base = touched && value !== null ? value : 0

  return (
    <div className="stepper">
      <button
        type="button"
        className="stepper-btn"
        aria-label="Decrease study hours"
        onClick={() => onChange(clamp(base - STEP))}
      >
        −
      </button>
      <span className={touched ? 'stepper__value mono' : 'stepper__value mono stepper__value--untouched'}>
        {touched ? `${value} h` : '—'}
      </span>
      <button
        type="button"
        className="stepper-btn"
        aria-label="Increase study hours"
        onClick={() => onChange(clamp(base + STEP))}
      >
        +
      </button>
      {touched && (
        <button type="button" className="stepper-btn stepper-btn--clear" aria-label="Clear study hours" onClick={onClear}>
          Clear
        </button>
      )}
    </div>
  )
}
