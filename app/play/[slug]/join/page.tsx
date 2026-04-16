import { notFound, redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'

export default async function BrandedJoinPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data: pool } = await supabase
    .from('pools')
    .select('pool_code')
    .eq('brand_slug', slug)
    .single()

  if (!pool) notFound()

  redirect(`/join/${pool.pool_code}`)
}
