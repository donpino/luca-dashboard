import { parseLocalISODate } from '../lib/dateUtils'

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

interface Props {
  disabled: boolean
  label: 'Save' | 'Update'
  status: SaveStatus
  error: string | null
  savedDate: string
  onSave: () => void
}

const formatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })

// Sticky, per DASHBOARD_SPEC.md §8.5. Disabled until shin is answered — the
// one required field — or while a save is in flight. Success/error state is
// explicit: no auto-dismiss, no auto-redirect, and a failure never clears
// the form (RESILIENCE).
export default function SaveFooter({ disabled, label, status, error, savedDate, onSave }: Props) {
  return (
    <div className="sticky-footer">
      <button type="button" className="save-btn" disabled={disabled} onClick={onSave}>
        {status === 'saving' ? 'Saving…' : label}
      </button>
      {status === 'success' && (
        <p className="status-text status-text--muted">
          Saved for {formatter.format(parseLocalISODate(savedDate))}.
        </p>
      )}
      {status === 'error' && error && <p className="status-text status-text--error">{error}</p>}
    </div>
  )
}
