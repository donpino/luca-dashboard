import LiquidSphere from '../../components/LiquidSphere'

type ShinValue = 0 | 1 | 2 | 3

const OPTIONS: { value: ShinValue; word: string }[] = [
  { value: 0, word: 'nothing' },
  { value: 1, word: 'aware' },
  { value: 2, word: 'sore' },
  { value: 3, word: 'gait' },
]

interface Props {
  value: ShinValue | null
  onChange: (value: ShinValue) => void
}

// No default selection (DASHBOARD_SPEC.md §8.5) — `value` starts null and
// stays null until tapped. Selected state is carried by fill + border
// weight + a checkmark, not colour alone, so it reads in grayscale.
export default function ShinSelector({ value, onChange }: Props) {
  return (
    <div className="shin-row" role="group" aria-label="Shin">
      {OPTIONS.map((opt) => {
        const selected = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className={selected ? 'shin-btn shin-btn--selected' : 'shin-btn'}
            aria-pressed={selected}
            onClick={() => onChange(opt.value)}
          >
            {/* fill rises with the answer: decorative, the number and word carry it */}
            <LiquidSphere size={34} level={opt.value === 0 ? null : opt.value / 3} color="#D4A017" bubbles={false} />
            <span className="shin-btn__number">
              {opt.value}
              {selected ? ' ✓' : ''}
            </span>
            <span className="shin-btn__word">{opt.word}</span>
          </button>
        )
      })}
    </div>
  )
}
