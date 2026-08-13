// Pure formatting helpers for the §8.1 "Flag" panel. Every number and
// date here comes straight off the JSON (CLAUDE.md rule 3, DASHBOARD_SPEC.md
// §8.1 v1.26 amendment) — this module only formats, it never re-derives
// which flag fired or re-runs the 10% comparison.

import type { TodayFlag } from './today'

export function flagLabel(flag: TodayFlag): string {
  switch (flag.kind) {
    case 'shin':
      return 'Shin'
    case 'illness':
      return 'Illness'
    case 'volume_ramp':
      return 'Volume ramp'
  }
}

export function flagText(flag: TodayFlag): string {
  switch (flag.kind) {
    case 'shin':
      return `Shin ${flag.shin} reported on ${flag.date}.`
    case 'illness':
      return `Illness reported on ${flag.date}.`
    case 'volume_ramp': {
      const pct = (flag.pct * 100).toFixed(0)
      const current = flag.current_7d_km.toFixed(1)
      const prev = flag.prev_7d_km.toFixed(1)
      return `Rolling 7-day km up ${pct}% — ${current} km vs ${prev} km (7 days ending ${flag.window_end}).`
    }
  }
}
