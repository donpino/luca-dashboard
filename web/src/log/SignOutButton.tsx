import { supabase } from './lib/supabaseClient'

export default function SignOutButton() {
  return (
    <button className="sign-out-btn" type="button" onClick={() => supabase.auth.signOut()}>
      Sign out
    </button>
  )
}
