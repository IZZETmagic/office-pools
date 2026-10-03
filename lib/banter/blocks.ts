import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Drop recipients who have blocked the sender (158).
 *
 * ⚠ Must be given the ADMIN client. `user_blocks` RLS only lets a member read their OWN blocks,
 * so the sender's session cannot see that someone blocked them — by design, the person blocked
 * must never be able to find out. A user-scoped client here would read zero rows and quietly
 * notify everyone.
 *
 * Fails OPEN on a read error (logs, returns everyone): a broken lookup should not silence every
 * banter push in the product.
 */
export async function withoutBlockersOf(
  admin: SupabaseClient,
  senderId: string,
  recipientIds: string[],
): Promise<string[]> {
  if (recipientIds.length === 0) return recipientIds
  const { data, error } = await admin
    .from('user_blocks')
    .select('blocker_id')
    .eq('blocked_id', senderId)
    .in('blocker_id', recipientIds)
  if (error) {
    console.error('[blocks] lookup failed — notifying without the block filter:', error)
    return recipientIds
  }
  const blockers = new Set((data ?? []).map(r => r.blocker_id as string))
  return blockers.size === 0 ? recipientIds : recipientIds.filter(id => !blockers.has(id))
}
