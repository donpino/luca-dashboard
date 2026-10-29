import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabaseClient'
import SignInForm from './SignInForm'
import SignOutButton from './SignOutButton'
import DailyForm from './DailyForm'
import PageLoader from '../components/PageLoader'

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
        <div className="screen screen--log">
          <PageLoader color="#D4A017" />
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div className="page">
        <div className="screen screen--log">
          <SignInForm />
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <div className="screen screen--log">
        <header className="log-head">
          <a className="round-btn round-btn--back" href="/" aria-label="Back to the dashboard">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="m15 18-6-6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
          <span className="note log-head__who">{session.user.email}</span>
          <SignOutButton />
        </header>
        <DailyForm />
      </div>
    </div>
  )
}
