import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AvatarStudio from './AvatarStudio'

// =============================================================
// /profile/avatar — where a member builds their face
// =============================================================
// ⭐⭐ ITS OWN ROUTE, NOT A TAB ON THE PROFILE PAGE, for two reasons that both bite.
//
// CODE SPLITTING. `ProfilePage.tsx` is one 2,153-line client module with no splitting anywhere —
// every tab is a conditional render — so a builder living in a tab would ship to every member
// who opens Statistics and never touches their avatar, along with the 564 KB art fetch. A route
// is the only thing that makes either of those load on demand.
//
// LAYOUT. The builder is `lg:grid-cols-[380px_1fr]` and its own header records that no phone
// layout was ever designed for it. The profile's tab content sits in a column beside a `w-56`
// sidebar, which is precisely the narrow case that was never designed. A route gives it the
// full width it was drawn for.
//
// ⚠ This page is BETA and lives only on the Development branch. It is not deployed to
// production; the branch is the gate. There is no feature flag in this app to hide it behind —
// the only mechanisms are the whole-app tester allowlist and `NODE_ENV` harness guards, neither
// of which fits a per-feature rollout.
// =============================================================

export default async function AvatarBuilderPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('users')
    .select('user_id, username, full_name, avatar_colour, avatar_build')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <AvatarStudio
      userId={profile.user_id}
      fullName={profile.full_name}
      username={profile.username}
      avatarColour={profile.avatar_colour}
      avatarBuild={profile.avatar_build}
    />
  )
}
