import { useState } from 'react'
import { supabase } from './lib/supabaseClient'

// Email + password only — no signup, no magic link, no reset UI, because
// public signups are disabled in this project (DASHBOARD_SPEC.md §8.5).
export default function SignInForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError(error.message)
    }
  }

  return (
    <form className="sign-in-form" onSubmit={handleSubmit}>
      <h1>Sign in</h1>
      <label className="sign-in-form__field">
        <span>Email</span>
        <input
          className="sign-in-form__input"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>
      <label className="sign-in-form__field">
        <span>Password</span>
        <input
          className="sign-in-form__input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>
      <button className="sign-in-form__submit" type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
      {error && <p className="status-text status-text--error">{error}</p>}
    </form>
  )
}
