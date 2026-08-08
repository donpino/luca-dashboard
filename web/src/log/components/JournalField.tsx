import { useRef } from 'react'

interface Props {
  value: string
  onChange: (next: string) => void
}

const PROMPT = 'What most affected your recovery and sleep today?'

// One line high, grows on focus/content (DASHBOARD_SPEC.md §8.5). Optional
// — the label carries the literal prompt text, not a generic field name.
export default function JournalField({ value, onChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function grow() {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  function collapseIfEmpty() {
    const el = ref.current
    if (!el) return
    if (el.value.trim() === '') {
      el.style.height = ''
    }
  }

  return (
    <label className="journal-field">
      <span className="group-header">
        {PROMPT} <span className="journal-field__hint">(optional)</span>
      </span>
      <textarea
        ref={ref}
        className="journal-field__textarea"
        rows={1}
        value={value}
        onChange={(e) => {
          onChange(e.target.value)
          grow()
        }}
        onFocus={grow}
        onBlur={collapseIfEmpty}
      />
    </label>
  )
}
