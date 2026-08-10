// §9's global range selector. Currently wired into the §8.3 shin panel
// only (see DASHBOARD_SPEC.md's v1.18 amendment for the scope note) but
// kept generic here, alongside DetailDrawer/Lane, per CLAUDE.md's layout.
//
// This component only reports which key the athlete picked — it never
// computes a start date or a coverage count. Both are read from
// compute/build_data.py's output (`range_start`, `coverage_by_range`) by
// the caller, so filtering by the selection made here stays a client-side
// *selection*, never a derivation (CLAUDE.md rule 3).

import type { RangeKey } from '../panels/shinSeries'

const RANGE_LABELS: Record<RangeKey, string> = {
  '7d': '7d',
  '30d': '30d',
  '90d': '90d',
  '6m': '6m',
  '1y': '1y',
  all: 'all',
}

interface RangeSelectorProps {
  options: RangeKey[]
  selected: RangeKey
  onSelect: (range: RangeKey) => void
}

export default function RangeSelector({ options, selected, onSelect }: RangeSelectorProps) {
  return (
    <div className="range-selector" role="group" aria-label="Date range">
      {options.map((key) => {
        const isSelected = key === selected
        return (
          <button
            key={key}
            type="button"
            className={
              isSelected ? 'range-selector__btn range-selector__btn--selected' : 'range-selector__btn'
            }
            aria-pressed={isSelected}
            onClick={() => onSelect(key)}
          >
            {RANGE_LABELS[key]}
          </button>
        )
      })}
    </div>
  )
}
