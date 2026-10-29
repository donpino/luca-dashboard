// §8.1 v1.39 day navigation. `day === null` is the live view (today.json +
// scores.json); a past day reads days/<day>.json, which compute/build_data.py
// writes as exactly the two payloads that day would have had — so Today and
// the detail pages render a past day with the same code and no derivation
// here (CLAUDE.md rule 3).

import type { MetricsResponse } from '../panels/metrics'
import type { ScoresResponse } from '../panels/scores'
import type { TodayResponse } from '../panels/today'
import { type LoadState, useJson } from './useJson'

interface DayFile {
  today: TodayResponse
  scores: ScoresResponse
  metrics: MetricsResponse
}

export interface DayData {
  today: LoadState<TodayResponse>
  scores: LoadState<ScoresResponse>
  metrics: LoadState<MetricsResponse>
}

function pick<K extends keyof DayFile>(state: LoadState<DayFile>, key: K): LoadState<DayFile[K]> {
  return state.status === 'ready' ? { status: 'ready', data: state.data[key] } : state
}

export function useDayData(day: string | null, version = 0): DayData {
  const today = useJson<TodayResponse>(day ? null : 'today.json', version)
  const scores = useJson<ScoresResponse>(day ? null : 'scores.json', version)
  const metrics = useJson<MetricsResponse>(day ? null : 'metrics.json', version)
  const past = useJson<DayFile>(day ? `days/${day}.json` : null, version)
  return day
    ? { today: pick(past, 'today'), scores: pick(past, 'scores'), metrics: pick(past, 'metrics') }
    : { today, scores, metrics }
}
