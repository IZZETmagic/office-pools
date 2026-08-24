import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { TIER_OFFERS } from '@/lib/paddle/tiers'
import { isPoolTier, resolveTier, type PoolTier } from '@/lib/paddle/transactionCompleted'
import { UpgradeOptions } from './UpgradeOptions'

// /pools/:pool_id/upgrade — the admin-facing tier checkout. Phase 3a Step 3.
//
// ⚠ REQUIRES migration 067 (pools.tier). The select below names `tier`, and a
// PostgREST 400 for an unknown column is discarded by this codebase's read
// helpers — the page would render "free" for every pool rather than failing.
// Apply 067 before deploying.
//
// A STANDALONE PAGE, NOT A TAB IN PoolDetail
// PoolDetail.tsx is ~2,000 lines carrying every tab's state, and its tab list
// is load-bearing for the payload-size work (only some tabs pull the pool-wide
// predictions array). Adding a checkout to it risks that for no benefit — a
// pricing comparison wants full width and is reached deliberately, not browsed.
export const dynamic = 'force-dynamic'

export default async function UpgradePage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()
  if (!userData) redirect('/dashboard')

  // Only an admin of THIS pool may see it. Mirrors the check in the upgrade
  // route — the route is the one that actually enforces it, this is so a
  // non-admin never sees a buy button they cannot use.
  const { data: membership } = await supabase
    .from('pool_members')
    .select('role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership || membership.role !== 'admin') notFound()

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_name, tier, archived_at')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) notFound()

  const currentTier: PoolTier = isPoolTier(pool.tier) ? pool.tier : 'free'
  const available = TIER_OFFERS.filter(
    offer => resolveTier(currentTier, offer.tier) !== currentTier,
  )

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <Link
        href={`/pools/${pool_id}`}
        className="text-sm text-neutral-500 transition-colors hover:text-neutral-700"
      >
        ← Back to {pool.pool_name}
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight text-neutral-900">
        Upgrade {pool.pool_name}
      </h1>
      <p className="mt-2 text-sm text-neutral-700">
        One payment for this competition. Not a subscription — nothing renews, and nothing
        is charged again.
      </p>

      <p className="mt-4 inline-block rounded-pill border border-border-default bg-surface-secondary px-3 py-1 text-xs font-semibold uppercase tracking-wide text-neutral-700">
        Currently on {currentTier}
      </p>

      {pool.archived_at ? (
        <p className="mt-8 rounded-control border border-warning-300 bg-warning-50 p-4 text-sm text-warning-800">
          This pool is archived. Restore it before upgrading.
        </p>
      ) : available.length === 0 ? (
        <p className="mt-8 rounded-control border border-border-default bg-surface-secondary p-4 text-sm text-neutral-700">
          {pool.pool_name} is on {currentTier}, the highest tier. There is nothing else to buy.
        </p>
      ) : (
        <UpgradeOptions poolId={pool_id} offers={available} />
      )}

      <p className="mt-10 text-xs leading-relaxed text-neutral-500">
        Payments are handled by Paddle, which acts as the merchant of record. SportPool
        never holds prize money and never takes a share of one — this charge is for the
        pool-organizing features only.
      </p>
    </main>
  )
}
