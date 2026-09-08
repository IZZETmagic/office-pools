import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email/send'
import { brandedTemplate } from '@/lib/email/templates'
import { dataRows, panel, paragraph, sectionLabel } from '@/lib/email/components'
import { withPerfLogging } from '@/lib/api-perf'
import {
  findContactCategory,
  isValidPoolCode,
  normalizePoolCode,
} from '@/lib/contact/categories'

async function handlePOST(request: NextRequest) {
  try {
    const { name, email, category: categoryId, poolCode, subject, message } = await request.json()

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: 'All fields are required.' },
        { status: 400 }
      )
    }

    // The category drives whether a pool code is mandatory, so it is resolved
    // against our own list rather than taken on trust — the client only ever
    // sends an id, and an unknown one must not fall through as "no code needed".
    const category = findContactCategory(categoryId)
    if (!category) {
      return NextResponse.json(
        { error: 'Please choose what your message is about.' },
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

    // Normalised here as well as in the form: the route is a public endpoint and
    // the browser is not the only thing that can post to it.
    const normalizedPoolCode = typeof poolCode === 'string' ? normalizePoolCode(poolCode) : ''

    if (category.requiresPoolCode && !normalizedPoolCode) {
      return NextResponse.json(
        { error: `A pool code is required for "${category.label}" so we can find the right pool.` },
        { status: 400 }
      )
    }

    if (normalizedPoolCode && !isValidPoolCode(normalizedPoolCode)) {
      return NextResponse.json(
        { error: "That pool code doesn't look right. Please check it and try again." },
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
            { label: 'Category', value: escapeHtml(category.label) },
            // Only rendered when there is one, so an absent code reads as absent
            // rather than as an empty row support has to interpret.
            ...(normalizedPoolCode
              ? [{ label: 'Pool code', value: escapeHtml(normalizedPoolCode) }]
              : []),
            { label: 'Name', value: escapeHtml(name) },
            { label: 'Email', value: escapeHtml(email) },
            { label: 'Subject', value: escapeHtml(subject) },
          ])
        )}
        ${sectionLabel('Message')}
        ${paragraph(escapeHtml(message).replace(/\n/g, '<br>'), { marginBottom: 0 })}
      `,
    })

    // Category and code go in the subject too: the inbox list is where triage
    // actually happens, and opening a message to find out which pool it concerns
    // is the cost this whole change exists to remove.
    const emailSubject = `[Contact] ${category.label}${normalizedPoolCode ? ` · ${normalizedPoolCode}` : ''} — ${subject}`

    const result = await sendEmail({
      to: 'support@sportpool.io',
      subject: emailSubject,
      html,
      text:
        `From: ${name} (${email})\n` +
        `Category: ${category.label}\n` +
        (normalizedPoolCode ? `Pool code: ${normalizedPoolCode}\n` : '') +
        `Subject: ${subject}\n\n${message}`,
      tags: [
        { name: 'category', value: 'contact-form' },
        // Resend tag values allow only [A-Za-z0-9_-]; category ids are snake_case
        // and pool codes normalise to A-Z0-9, so both are already safe.
        { name: 'contact_category', value: category.id },
        ...(normalizedPoolCode ? [{ name: 'pool_code', value: normalizedPoolCode }] : []),
      ],
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
