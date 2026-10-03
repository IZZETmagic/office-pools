import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { messageReportAlertTemplate } from '@/lib/email/templates'

const REASONS = ['spam', 'offensive', 'harassment', 'inappropriate_image', 'other'] as const
type Reason = (typeof REASONS)[number]

const REASON_LABEL: Record<Reason, string> = {
  spam: 'Spam',
  offensive: 'Offensive',
  harassment: 'Harassment or bullying',
  inappropriate_image: 'Inappropriate image',
  other: 'Something else',
}

/**
 * POST /api/banter/report
 *
 * Body: { message_id, reason, details? }
 *
 * Files the report as the CALLER (report_pool_message, 158 — it checks membership, refuses your
 * own message and takes the snapshot itself), then emails the support inbox so a report is seen
 * the same day: Apple's guideline 1.2 asks for a timely response, not just a button.
 *
 * The email is best-effort. The report is already stored and listed in Super Admin → Reports,
 * so a mail failure is logged and the member still gets a success.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  let body: { message_id?: string; reason?: string; details?: string | null }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const reason = body.reason as Reason
  if (!body.message_id || !REASONS.includes(reason)) {
    return NextResponse.json({ error: 'message_id and a valid reason are required' }, { status: 400 })
  }

  const { data: reportId, error } = await supabase.rpc('report_pool_message', {
    p_message_id: body.message_id,
    p_reason: reason,
    p_details: body.details ?? null,
  })

  if (error || !reportId) {
    // 42501 not a member / not signed in · 22023 own message · P0002 gone
    const status = error?.code === '42501' ? 403 : error?.code === 'P0002' ? 404 : 400
    console.error('[BanterReport] report_pool_message failed:', error)
    return NextResponse.json({ error: error?.message ?? 'Could not file the report' }, { status })
  }

  try {
    const admin = createAdminClient()
    const { data: report } = await admin
      .from('pool_message_reports')
      .select('pool_id, reporter_id, reported_user_id, details, content_snapshot, type_snapshot')
      .eq('report_id', reportId)
      .single()

    if (report) {
      const [pool, people, open] = await Promise.all([
        admin.from('pools').select('pool_name').eq('pool_id', report.pool_id).single(),
        admin
          .from('users')
          .select('user_id, username, full_name')
          .in('user_id', [report.reporter_id, report.reported_user_id].filter(Boolean) as string[]),
        admin.from('pool_message_reports').select('report_id', { count: 'exact', head: true }).eq('status', 'open'),
      ])
      const nameOf = (id: string | null) => {
        const u = (people.data ?? []).find(p => p.user_id === id)
        return u ? `${u.full_name || u.username} (@${u.username})` : 'Unknown member'
      }
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
      const { subject, html } = messageReportAlertTemplate({
        poolName: pool.data?.pool_name ?? 'a pool',
        reporterName: nameOf(report.reporter_id),
        reportedName: nameOf(report.reported_user_id),
        reason: REASON_LABEL[reason],
        details: report.details,
        contentSnapshot: report.content_snapshot,
        typeSnapshot: report.type_snapshot,
        openReportCount: open.count ?? 1,
        reportsUrl: `${appUrl}/admin/super?tab=reports`,
      })
      const result = await sendEmail({
        to: process.env.REPORT_ALERT_EMAIL || 'support@sportpool.io',
        subject,
        html,
        tags: [{ name: 'category', value: 'moderation' }],
      })
      if (!result.success) console.error('[BanterReport] alert email failed:', result.error)
    }
  } catch (err) {
    console.error('[BanterReport] alert email threw:', err)
  }

  return NextResponse.json({ reported: true, report_id: reportId })
}
