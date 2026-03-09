import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  // 1. Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 2. Verify super admin
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  // 3. Run all aggregate queries in parallel
  const [
    entriesCountRes,
    submittedEntriesRes,
    predictionsCountRes,
    weeklyRegsRes,
    predsByStageRes,
    apiPerfRes,
    apiPerfTimeSeriesRes,
    tableSizesRes,
    recentAuditRes,
    poolMembersRes,
  ] = await Promise.all([
    // Total entries count
    supabase.from('pool_entries').select('entry_id', { count: 'exact', head: true }),

    // Submitted entries count
    supabase
      .from('pool_entries')
      .select('entry_id', { count: 'exact', head: true })
      .eq('has_submitted_predictions', true),

    // Total predictions count
    supabase.from('predictions').select('prediction_id', { count: 'exact', head: true }),

    // Weekly registrations (last 12 weeks)
    supabase.rpc('get_weekly_registrations'),

    // Predictions by stage
    supabase.rpc('get_predictions_by_stage'),

    // API perf summary (last 24h)
    supabase.rpc('get_api_perf_summary'),

    // API perf time series (last 24h, hourly)
    supabase.rpc('get_api_perf_time_series'),

    // Table row counts
    supabase.rpc('get_table_row_counts'),

    // Recent audit count (last 24h)
    supabase
      .from('admin_audit_log')
      .select('id', { count: 'exact', head: true })
      .gte('performed_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),

    // Total pool members
    supabase.from('pool_members').select('member_id', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    totalEntries: entriesCountRes.count ?? 0,
    submittedEntries: submittedEntriesRes.count ?? 0,
    totalPredictions: predictionsCountRes.count ?? 0,
    weeklyRegistrations: weeklyRegsRes.data ?? [],
    predictionsByStage: predsByStageRes.data ?? [],
    apiPerf: apiPerfRes.data ?? [],
    apiPerfTimeSeries: apiPerfTimeSeriesRes.data ?? [],
    tableSizes: tableSizesRes.data ?? [],
    recentAuditCount: recentAuditRes.count ?? 0,
    totalPoolMembers: poolMembersRes.count ?? 0,
  })
}

// DELETE — Purge old perf logs (older than 7 days)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData?.is_super_admin) {
    return NextResponse.json({ error: 'Super admin required' }, { status: 403 })
  }

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await supabase
    .from('api_perf_log')
    .delete()
    .lt('created_at', cutoff)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ deleted: count ?? 0 })
}
