import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import SignInForm from './SignInForm'
import SignOutButton from './SignOutButton'
import DailyForm from './DailyForm'

export default function LogPage() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="page">
        <p className="status-text status-text--muted">Loading…</p>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="page">
        <SignInForm />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-header">
        <span className="status-text status-text--muted mono">{session.user.email}</span>
        <SignOutButton />
      </div>
      <DailyForm />
    </div>
  )
}
