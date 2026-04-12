import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { getResendClient } from '@/lib/email/resend'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const { id } = await params
  const resend = getResendClient()

  const type = _req.nextUrl.searchParams.get('type') || 'sent'

  if (type === 'received') {
    const { data, error } = await resend.emails.receiving.get(id)
    if (error) {
      return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 })
    }
    return NextResponse.json({ email: data })
  }

  const { data, error } = await resend.emails.get(id)
  if (error) {
    return NextResponse.json({ error: 'Failed to fetch email' }, { status: 500 })
  }
  return NextResponse.json({ email: data })
}
