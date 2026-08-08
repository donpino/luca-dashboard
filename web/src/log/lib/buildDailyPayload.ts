// The one place the /log write payload is assembled (DASHBOARD_SPEC.md
// §8.5, CLAUDE.md hard rules 4 and 12). Pure and side-effect free — no
// import here ever reaches supabaseClient.ts, so this module needs no
// network and no DOM to test.

export interface DailyFormState {
  shin: 0 | 1 | 2 | 3 | null
  illness: boolean
  creatine: boolean
  protein_breakfast: boolean
  alcohol: boolean
  late_meal: boolean
  device_in_bed: boolean
  cold_room: boolean
  breathing_exercises: boolean
  stretching: boolean
  study_hours: number | null
  studyHoursTouched: boolean
  journal: string
}

export interface DailyPayload {
  date: string
  shin: 0 | 1 | 2 | 3
  illness: boolean
  creatine: boolean
  protein_breakfast: boolean
  alcohol: boolean
  late_meal: boolean
  device_in_bed: boolean
  cold_room: boolean
  breathing_exercises: boolean
  stretching: boolean
  study_hours: number | null
  journal: string | null
}

export const emptyFormState: DailyFormState = {
  shin: null,
  illness: false,
  creatine: false,
  protein_breakfast: false,
  alcohol: false,
  late_meal: false,
  device_in_bed: false,
  cold_room: false,
  breathing_exercises: false,
  stretching: false,
  study_hours: null,
  studyHoursTouched: false,
  journal: '',
}

export class MissingShinError extends Error {
  constructor() {
    super('shin is required before saving')
    this.name = 'MissingShinError'
  }
}

// `date` is an already-formatted YYYY-MM-DD string (see dateUtils.ts) — it
// is never reparsed as a Date here, so this function can't reintroduce a
// UTC shift no matter how it's called.
export function buildDailyPayload(state: DailyFormState, date: string): DailyPayload {
  if (state.shin === null) {
    throw new MissingShinError()
  }

  return {
    date,
    shin: state.shin,
    illness: state.illness,
    creatine: state.creatine,
    protein_breakfast: state.protein_breakfast,
    alcohol: state.alcohol,
    late_meal: state.late_meal,
    device_in_bed: state.device_in_bed,
    cold_room: state.cold_room,
    breathing_exercises: state.breathing_exercises,
    stretching: state.stretching,
    // Untouched -> null, never 0. 0 is a real value once the stepper has
    // been touched (CLAUDE.md hard rule 12's null-vs-zero rule, extended
    // here to study_hours per DASHBOARD_SPEC.md §5).
    study_hours: state.studyHoursTouched ? state.study_hours : null,
    journal: state.journal.trim() === '' ? null : state.journal.trim(),
  }
}
