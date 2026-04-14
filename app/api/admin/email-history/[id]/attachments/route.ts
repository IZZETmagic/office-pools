import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const { id } = await params

  try {
    // Resend API: list attachments for a received email
    const res = await fetch(`https://api.resend.com/emails/receiving/${id}/attachments`, {
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
    })

    if (!res.ok) {
      const text = await res.text()
      console.error('[Attachments] Resend API error:', res.status, text)
      return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ attachments: data.data || data || [] })
  } catch (err) {
    console.error('[Attachments] Error:', err)
    return NextResponse.json({ error: 'Failed to fetch attachments' }, { status: 500 })
  }
}
