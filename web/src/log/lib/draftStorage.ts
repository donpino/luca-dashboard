// In-progress draft, kept per-date in localStorage (DASHBOARD_SPEC.md §8.5
// RESILIENCE). Restored only when no server row exists for that date;
// cleared on successful save. Wrapped in try/catch — localStorage can throw
// (private browsing, quota) and a draft is a convenience, not a correctness
// requirement, so a failure here must never break the form.
import type { DailyFormState } from './buildDailyPayload'

function storageKey(date: string): string {
  return `luca-dashboard:daily-draft:${date}`
}

export function loadDraft(date: string): Partial<DailyFormState> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(date))
    if (!raw) return null
    return JSON.parse(raw) as Partial<DailyFormState>
  } catch {
    return null
  }
}

export function saveDraft(date: string, state: DailyFormState): void {
  try {
    window.localStorage.setItem(storageKey(date), JSON.stringify(state))
  } catch {
    // ignore — draft persistence is best-effort
  }
}

export function clearDraft(date: string): void {
  try {
    window.localStorage.removeItem(storageKey(date))
  } catch {
    // ignore
  }
}
