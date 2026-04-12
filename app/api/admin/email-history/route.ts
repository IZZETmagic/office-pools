import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getResendClient } from '@/lib/email/resend'

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const resend = getResendClient()

  const [sent, received] = await Promise.all([
    resend.emails.list({ limit: 50 }),
    resend.emails.receiving.list({ limit: 50 }).catch(() => ({ data: null, error: true })),
  ])

  return NextResponse.json({
    emails: sent.data?.data ?? [],
    received: received.data?.data ?? [],
  })
}
