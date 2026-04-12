import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email/send'
import { supportTemplate } from '@/lib/email/templates'

const SUPPORT_EMAIL = process.env.RESEND_SUPPORT_EMAIL || 'support@sportpool.io'

function extractFirstName(fullName?: string | null, username?: string | null): string {
  if (fullName) {
    const first = fullName.trim().split(/\s+/)[0]
    if (first) return first
  }
  return username || 'there'
}

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  let body: {
    to: string
    subject: string
    body_text: string
    in_reply_to?: string
    references?: string
    preview?: boolean
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.to || !body.subject || !body.body_text) {
    return NextResponse.json({ error: 'to, subject, and body_text are required' }, { status: 400 })
  }

  // Look up user by email to personalize the greeting
  const supabase = createAdminClient()
  const { data: user } = await supabase
    .from('users')
    .select('full_name, username')
    .eq('email', body.to)
    .maybeSingle()

  const firstName = extractFirstName(user?.full_name, user?.username)

  const bodyHtml = body.body_text.replace(/\n/g, '<br>')
  const html = supportTemplate({
    preheader: body.subject,
    heading: body.subject.replace(/^Re:\s*/i, ''),
    body: `<p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${firstName},</p>
      <div style="color:#525252;line-height:1.6;">${bodyHtml}</div>
      <p style="color:#737373;line-height:1.6;margin:16px 0 0;font-size:13px;">— The Sport Pool Team</p>`,
  })

  // Preview mode — return HTML without sending, include resolved name
  if (body.preview) {
    return NextResponse.json({ html, firstName })
  }

  // Build threading headers so email clients group this as a thread
  const headers: Record<string, string> = {}
  if (body.in_reply_to) {
    headers['In-Reply-To'] = body.in_reply_to
    headers['References'] = body.references || body.in_reply_to
  }

  const result = await sendEmail({
    to: body.to,
    subject: body.subject,
    html,
    reply_to: SUPPORT_EMAIL,
    headers: Object.keys(headers).length > 0 ? headers : undefined,
    tags: [{ name: 'category', value: 'support-reply' }],
  })

  if (!result.success) {
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Reply sent', id: result.id })
}
