import { addLocalDays, parseLocalISODate, todayISODate } from '../lib/dateUtils'

interface Props {
  value: string
  onChange: (next: string) => void
  isEditing: boolean
}

const formatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

export default function DateHeader({ value, onChange, isEditing }: Props) {
  const today = todayISODate()

  function handlePickerChange(next: string) {
    // Future dates rejected (DASHBOARD_SPEC.md §8.5) — the native `max`
    // already keeps the picker itself from offering later dates; this
    // guards against a browser that doesn't enforce it.
    if (next > today) return
    onChange(next)
  }

  return (
    <div className="date-header">
      <p className="date-header__title">{formatter.format(parseLocalISODate(value))}</p>
      {isEditing && <p className="date-header__editing">Editing existing entry</p>}
      <div className="date-header__controls">
        <button
          type="button"
          className="date-header__yesterday"
          onClick={() => onChange(addLocalDays(value, -1))}
        >
          Yesterday
        </button>
        <input
          type="date"
          className="date-header__input"
          value={value}
          max={today}
          onChange={(e) => handlePickerChange(e.target.value)}
        />
      </div>
    </div>
  )
}
