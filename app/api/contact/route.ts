import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'

export async function POST(request: NextRequest) {
  try {
    const { name, email, subject, message } = await request.json()

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'All fields are required.' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    // Validate field lengths
    if (name.length > 200 || email.length > 200 || subject.length > 300 || message.length > 5000) {
      return NextResponse.json(
        { error: 'One or more fields exceed the maximum length.' },
        { status: 400 }
      )
    }

    const html = `
      <div style="font-family: sans-serif; max-width: 600px;">
        <h2 style="color: #1e293b;">New Contact Form Submission</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top; width: 80px;"><strong>Name:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${escapeHtml(name)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;"><strong>Email:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${escapeHtml(email)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; vertical-align: top;"><strong>Subject:</strong></td>
            <td style="padding: 8px 0; color: #1e293b;">${escapeHtml(subject)}</td>
          </tr>
        </table>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
        <div style="color: #1e293b; white-space: pre-wrap;">${escapeHtml(message)}</div>
      </div>
    `

    const result = await sendEmail({
      to: 'support@sportpool.io',
      subject: `[Contact] ${subject}`,
      html,
      text: `From: ${name} (${email})\nSubject: ${subject}\n\n${message}`,
      tags: [{ name: 'category', value: 'contact-form' }],
    })

    if (!result.success) {
      console.error('[Contact] Failed to send:', result.error)
      return NextResponse.json(
        { error: 'Failed to send message. Please try again later.' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[Contact] Exception:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
