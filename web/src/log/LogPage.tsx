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

  // v1.43: a tab inside App — App's own .page and tab bar frame it
  if (loading) {
    return (
      <div className="screen screen--log">
        <PageLoader color="#D4A017" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="screen screen--log">
        <SignInForm />
      </div>
    )
  }

  return (
    <div className="screen screen--log">
      <header className="log-head">
        <span className="note log-head__who">{session.user.email}</span>
        <SignOutButton />
      </header>
      <DailyForm />
    </div>
  )
}
