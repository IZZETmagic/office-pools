import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ActivityPage } from './ActivityPage'

export const metadata = { title: 'Activity · SportPool' }

// The web Activity page (Ryan, 2026-10-07). Signed in only; the feed itself loads in the browser
// from the same route the app reads (/api/users/[user_id]/activity), so the page shell is instant
// and the ~1.5s route never holds up the first paint.
export default async function Page() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!userData) redirect('/login')

  return <ActivityPage userId={userData.user_id} isSuperAdmin={!!userData.is_super_admin} />
}
