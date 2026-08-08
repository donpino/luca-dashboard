import { createClient } from '@supabase/supabase-js'

// The publishable key is public by design (CLAUDE.md hard rule 8,
// DASHBOARD_SPEC.md §11.5) — RLS plus the table-level grants in
// db/migrations/001_daily.sql are the actual write boundary. This client
// (and this key) is imported only from files under src/log/ — the public
// dashboard bundle never sees it.
const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — copy web/.env.example to web/.env.local and fill in real values.',
  )
}

export const supabase = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // No magic-link / OAuth redirect flow is used (DASHBOARD_SPEC.md §8.5:
    // email + password sign-in only), so there is nothing in the URL to
    // parse on load.
    detectSessionInUrl: false,
  },
})

export interface DailyRow {
  date: string
  shin: 0 | 1 | 2 | 3 | null
  creatine: boolean | null
  protein_breakfast: boolean | null
  alcohol: boolean | null
  late_meal: boolean | null
  device_in_bed: boolean | null
  cold_room: boolean | null
  breathing_exercises: boolean | null
  stretching: boolean | null
  illness: boolean | null
  study_hours: number | null
  journal: string | null
  updated_at: string
}
