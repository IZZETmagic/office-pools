import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { readCrew } from '@/lib/crews/read'
import { createAdminClient, createClient } from '@/lib/supabase/server'

import { CrewPage } from './CrewPage'

// One crew on the web — playing now, all-time, past seasons, the people in it, Leave.
//
// Shipped basic with the RN release (decision 8, plan §8a) — the World Cup groups are on the web, and
// a crew they save from the dashboard needs somewhere to land — and given the captain's controls
// (rename, co-captain, remove, add people) in §8b.
//
// ⚠ The crew tables are deny-all (migration 154): read with the admin client, and ONLY through
// readCrew, which decides who may see the crew. Never-members, the removed and closed crews all get
// null → 404, the same answer GET /api/crews/:id gives — the page never says a crew exists to
// someone who isn't in it.

export const metadata: Metadata = { title: 'Crew', robots: { index: false, follow: false } }

export default async function CrewServerPage({ params }: { params: Promise<{ crew_id: string }> }) {
  const { crew_id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect(`/login?redirectTo=${encodeURIComponent(`/crews/${crew_id}`)}`)

  const { data: me } = await supabase
    .from('users')
    .select('user_id, username, full_name, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!me) redirect('/login')

  const crew = await loadCrew(crew_id, me.user_id)
  if (!crew) notFound()

  return (
    <CrewPage
      crew={crew}
      viewerId={me.user_id}
      viewerName={me.full_name?.trim() || me.username || 'You'}
      isSuperAdmin={!!me.is_super_admin}
    />
  )
}

/** The read, outside the component body: "now" is a fact of the request, not of rendering. */
function loadCrew(crewId: string, viewerId: string) {
  return readCrew(createAdminClient(), crewId, viewerId, Date.now())
}
