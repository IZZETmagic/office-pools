import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { joinPool } from '@/lib/pools/join'
import { syncContactToResend } from '@/lib/email/contacts'
import { dispatch } from '@/lib/notifications/outbox'
import { COMPOSERS } from '@/lib/notifications/composers'

// The join itself — lookup, join-ability, the tier cap, restoring a returning
// member's entries, the first entry, the Showdown schedule — lives in
// lib/pools/join.ts so every door into a pool walks the same steps.
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const { pool_id, pool_code } = await request.json()

  if (!pool_id && !pool_code) {
    return NextResponse.json({ error: 'pool_id or pool_code is required' }, { status: 400 })
  }

  // Admin client: the pool code is the auth mechanism for private pools, and
  // since migration 151 there is no client INSERT policy on pool_members.
  const result = await joinPool(
    createAdminClient(),
    pool_id ? { poolId: pool_id } : { poolCode: pool_code },
    userData.user_id,
  )

  if (!result.ok) {
    return NextResponse.json(
      result.reason ? { error: result.error, reason: result.reason } : { error: result.error },
      { status: result.status },
    )
  }

  // The join queued its notices (a welcome; "X joined" to the admin). Send them
  // once the response has gone, so the join is not slowed by them — and if this
  // fails, the outbox's minute job sends them; neither path sends twice.
  if (result.queued.length > 0) {
    const ids = result.queued
    const userId = userData.user_id
    after(async () => {
      const admin = createAdminClient()
      // The welcome is an email under a Resend topic, which needs the member to
      // be a Resend contact. Signing up on the website makes one; the app does
      // not — so make sure, as /api/notifications/pool-joined always did.
      try {
        const { data: u } = await admin.from('users').select('email, username, full_name').eq('user_id', userId).single()
        if (u?.email) {
          const nameParts = (u.full_name || '').split(' ')
          await syncContactToResend({
            email: u.email,
            firstName: nameParts[0] || u.username,
            lastName: nameParts.slice(1).join(' ') || undefined,
          })
        }
      } catch (err) {
        console.error('[join] contact sync failed; sending anyway:', err)
      }
      await dispatch(admin, COMPOSERS, { ids }).catch((err) =>
        console.error('[join] notice dispatch failed; the outbox will retry:', err))
    })
  }

  return NextResponse.json({
    member_id: result.memberId,
    pool_id: result.poolId,
    pool_name: result.poolName,
    restored_entries: result.restoredEntries,
  })
}
