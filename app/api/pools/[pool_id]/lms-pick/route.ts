import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { saveLmsPick } from '@/lib/league/lms'

// =============================================================
// POST /api/pools/[pool_id]/lms-pick
//
// One club, one matchweek. The USER-scoped client throughout: RLS is what stops
// a member writing on somebody else's entry or reading a live pick, and reaching
// for the admin client here would step straight around it.
// =============================================================

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await request.json()
  const { roundId, entryId, matchweekNumber, clubId } = body as {
    roundId?: string; entryId?: string; matchweekNumber?: number; clubId?: string
  }
  if (!roundId || !entryId || !matchweekNumber || !clubId) {
    return NextResponse.json({ error: 'A round, an entry, a matchweek and a club are required.' }, { status: 400 })
  }

  // The entry must be this member's. RLS would refuse the write anyway, but it
  // refuses by writing nothing — which this route reports as "the deadline
  // passed", and that is the wrong answer to "that is not your entry".
  const { data: owned } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('entry_id', entryId)
    .eq('member_id', membership.member_id)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: 'That entry is not yours.' }, { status: 403 })

  const result = await saveLmsPick(supabase, { roundId, entryId, matchweekNumber, clubId })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  if (result.refused) {
    return NextResponse.json(
      {
        error: 'This matchweek has closed, or you are already out of this round.',
        refused: true,
      },
      { status: 403 },
    )
  }
  return NextResponse.json({ saved: true })
}
