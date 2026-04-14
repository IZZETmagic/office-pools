import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { JoinPoolClient } from './JoinPoolClient'

export const dynamic = 'force-dynamic'

export default async function JoinPage({
  params,
}: {
  params: Promise<{ pool_code: string }>
}) {
  const { pool_code } = await params
  const supabase = await createClient()

  // Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Look up user in users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, username')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/dashboard')

  // Look up pool by code using admin client to bypass RLS (pool code is the auth mechanism for private pools)
  const adminClient = createAdminClient()
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, pool_code, description, status, prediction_mode, brand_name, brand_emoji, brand_color, brand_accent')
    .eq('pool_code', pool_code.toUpperCase())
    .single()

  if (!pool) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-secondary px-4">
        <div className="max-w-md w-full text-center">
          <div className="text-5xl mb-4">&#9917;</div>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Pool Not Found</h1>
          <p className="text-neutral-500 mb-6">
            The pool code &ldquo;{pool_code.toUpperCase()}&rdquo; doesn&apos;t match any pool. Check the link and try again.
          </p>
          <a
            href="/pools"
            className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors"
          >
            Browse Pools
          </a>
        </div>
      </div>
    )
  }

  // Check if already a member
  const { data: existingMembership } = await adminClient
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool.pool_id)
    .eq('user_id', userData.user_id)
    .single()

  // Get member count
  const { count: memberCount } = await adminClient
    .from('pool_members')
    .select('member_id', { count: 'exact', head: true })
    .eq('pool_id', pool.pool_id)

  return (
    <JoinPoolClient
      pool={{
        pool_id: pool.pool_id,
        pool_name: pool.pool_name,
        pool_code: pool.pool_code,
        description: pool.description,
        status: pool.status,
        prediction_mode: pool.prediction_mode,
        brand_name: pool.brand_name ?? null,
        brand_emoji: pool.brand_emoji ?? null,
        brand_color: pool.brand_color ?? null,
        brand_accent: pool.brand_accent ?? null,
      }}
      memberCount={memberCount ?? 0}
      isAlreadyMember={!!existingMembership}
    />
  )
}
