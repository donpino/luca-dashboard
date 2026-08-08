import { useEffect, useState } from 'react'
import { supabase, type DailyRow } from './lib/supabaseClient'
import {
  buildDailyPayload,
  emptyFormState,
  type DailyFormState,
} from './lib/buildDailyPayload'
import { defaultLogDate } from './lib/dateUtils'
import { clearDraft, loadDraft, saveDraft } from './lib/draftStorage'
import DateHeader from './components/DateHeader'
import GroupHeader from './components/GroupHeader'
import ShinSelector from './components/ShinSelector'
import ToggleRow from './components/ToggleRow'
import StudyHoursStepper from './components/StudyHoursStepper'
import JournalField from './components/JournalField'
import SaveFooter from './components/SaveFooter'

type SaveStatus = 'idle' | 'saving' | 'success' | 'error'

function rowToFormState(row: DailyRow): DailyFormState {
  return {
    shin: row.shin,
    illness: row.illness ?? false,
    creatine: row.creatine ?? false,
    protein_breakfast: row.protein_breakfast ?? false,
    alcohol: row.alcohol ?? false,
    late_meal: row.late_meal ?? false,
    device_in_bed: row.device_in_bed ?? false,
    cold_room: row.cold_room ?? false,
    breathing_exercises: row.breathing_exercises ?? false,
    stretching: row.stretching ?? false,
    study_hours: row.study_hours,
    studyHoursTouched: row.study_hours !== null,
    journal: row.journal ?? '',
  }
}

export default function DailyForm() {
  const [selectedDate, setSelectedDate] = useState(() => defaultLogDate())
  const [existingRow, setExistingRow] = useState<DailyRow | null>(null)
  const [loadingRow, setLoadingRow] = useState(true)
  const [formState, setFormState] = useState<DailyFormState>(emptyFormState)
  const [hydratedForDate, setHydratedForDate] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  function setField<K extends keyof DailyFormState>(key: K, value: DailyFormState[K]) {
    setFormState((prev) => ({ ...prev, [key]: value }))
  }

  // Fetch/prefill: runs on mount and whenever the selected date changes.
  // Zero rows for a date is the normal case, hence maybeSingle (not
  // single), and hence no error state for "not found".
  useEffect(() => {
    let cancelled = false
    setLoadingRow(true)
    setHydratedForDate(null)
    setSaveStatus('idle')
    setSaveError(null)

    supabase
      .from('daily')
      .select('*')
      .eq('date', selectedDate)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        if (data) {
          setExistingRow(data as DailyRow)
          setFormState(rowToFormState(data as DailyRow))
        } else {
          setExistingRow(null)
          const draft = loadDraft(selectedDate)
          setFormState(draft ? { ...emptyFormState, ...draft } : emptyFormState)
        }
        setLoadingRow(false)
        setHydratedForDate(selectedDate)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate])

  // Draft persistence — gated on hydratedForDate so the momentary default
  // state (before the fetch above resolves) never overwrites a real draft.
  useEffect(() => {
    if (hydratedForDate !== selectedDate) return
    saveDraft(selectedDate, formState)
  }, [formState, selectedDate, hydratedForDate])

  async function handleSubmit() {
    const payload = buildDailyPayload(formState, selectedDate)
    setSaveStatus('saving')
    setSaveError(null)

    const { error } = await supabase.from('daily').upsert(payload, { onConflict: 'date' })

    if (error) {
      setSaveStatus('error')
      setSaveError(error.message)
      return
    }

    clearDraft(selectedDate)
    setExistingRow(payload as DailyRow)
    setSaveStatus('success')
  }

  return (
    <div>
      <DateHeader value={selectedDate} onChange={setSelectedDate} isEditing={existingRow !== null} />

      {loadingRow && <p className="status-text status-text--muted">Loading…</p>}

      <div className="group">
        <GroupHeader label="Status" />
        <ShinSelector value={formState.shin} onChange={(v) => setField('shin', v)} />
        <ToggleRow
          label="Illness"
          checked={formState.illness}
          onChange={(v) => setField('illness', v)}
        />
      </div>

      <div className="group">
        <GroupHeader label="Fuelling" />
        <ToggleRow
          label="Creatine"
          checked={formState.creatine}
          onChange={(v) => setField('creatine', v)}
        />
        <ToggleRow
          label="Protein breakfast"
          checked={formState.protein_breakfast}
          onChange={(v) => setField('protein_breakfast', v)}
        />
        <ToggleRow
          label="Alcohol — any amount"
          checked={formState.alcohol}
          onChange={(v) => setField('alcohol', v)}
        />
        <ToggleRow
          label="Late meal"
          checked={formState.late_meal}
          onChange={(v) => setField('late_meal', v)}
        />
      </div>

      <div className="group">
        <GroupHeader label="Sleep setup" />
        <ToggleRow
          label="Phone in bed"
          checked={formState.device_in_bed}
          onChange={(v) => setField('device_in_bed', v)}
        />
        <ToggleRow
          label="Cold room"
          checked={formState.cold_room}
          onChange={(v) => setField('cold_room', v)}
        />
      </div>

      <div className="group">
        <GroupHeader label="Recovery work" />
        <ToggleRow
          label="Breathing exercises"
          checked={formState.breathing_exercises}
          onChange={(v) => setField('breathing_exercises', v)}
        />
        <ToggleRow
          label="Stretching"
          checked={formState.stretching}
          onChange={(v) => setField('stretching', v)}
        />
      </div>

      <div className="group">
        <GroupHeader label="Study" />
        <StudyHoursStepper
          value={formState.study_hours}
          touched={formState.studyHoursTouched}
          onChange={(v) => {
            setField('study_hours', v)
            setField('studyHoursTouched', true)
          }}
          onClear={() => {
            setField('study_hours', null)
            setField('studyHoursTouched', false)
          }}
        />
      </div>

      <div className="group">
        <JournalField value={formState.journal} onChange={(v) => setField('journal', v)} />
      </div>

      <SaveFooter
        disabled={formState.shin === null || saveStatus === 'saving'}
        label={existingRow ? 'Update' : 'Save'}
        status={saveStatus}
        error={saveError}
        savedDate={selectedDate}
        onSave={handleSubmit}
      />
    </div>
  )
}
