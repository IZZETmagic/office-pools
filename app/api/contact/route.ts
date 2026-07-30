import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { brandedTemplate } from '@/lib/email/templates'
import { dataRows, panel, paragraph, sectionLabel } from '@/lib/email/components'
import { withPerfLogging } from '@/lib/api-perf'

async function handlePOST(request: NextRequest) {
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

    // Internal notification to the support inbox — same shell as everything else, but
    // `footer: 'none'` because nobody subscribed to this and an unsubscribe link on an
    // ops email would be nonsense. Every interpolation stays escaped: this body is
    // entirely attacker-controlled.
    const html = brandedTemplate({
      preheader: `${escapeHtml(name)}: ${escapeHtml(subject)}`,
      heading: 'New contact form submission',
      headerLabel: 'Contact',
      footer: 'none',
      body: `
        ${panel(
          dataRows([
            { label: 'Name', value: escapeHtml(name) },
            { label: 'Email', value: escapeHtml(email) },
            { label: 'Subject', value: escapeHtml(subject) },
          ])
        )}
        ${sectionLabel('Message')}
        ${paragraph(escapeHtml(message).replace(/\n/g, '<br>'), { marginBottom: 0 })}
      `,
    })

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

export const POST = withPerfLogging('/api/contact', handlePOST)
