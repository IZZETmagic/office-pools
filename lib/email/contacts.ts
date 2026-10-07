import { getResendClient } from './resend'

/**
 * Make sure a member is a Resend contact in the "General" segment — the list a Broadcast goes
 * to (RESEND_AUDIENCE_ID; Resend turned audiences into segments, keeping the ids).
 *
 * Contacts are global in Resend now, and the audience calls this used are deprecated (N4,
 * 2026-10-07). So: create the contact already in the segment; if it exists, add it to the
 * segment instead. Idempotent — a member already there makes both a harmless no-op.
 */
export async function syncContactToResend(params: {
  email: string
  firstName?: string
  lastName?: string
}) {
  const resend = getResendClient()
  const segmentId = process.env.RESEND_AUDIENCE_ID
  if (!segmentId) {
    console.error('[Resend] Missing RESEND_AUDIENCE_ID (the General segment)')
    return
  }

  try {
    const { error } = await resend.contacts.create({
      email: params.email,
      firstName: params.firstName || undefined,
      lastName: params.lastName || undefined,
      segments: [{ id: segmentId }],
    })
    if (!error) return
    // Most often the contact already exists — then it is the segment membership that matters.
    const added = await resend.contacts.segments.add({ email: params.email, segmentId })
    if (added.error && !/already/i.test(added.error.message)) {
      console.error('[Resend] Contact not added to General:', added.error.message)
    }
  } catch (err) {
    console.error('[Resend] Failed to sync contact:', err)
  }
}

export async function removeContactFromResend(email: string) {
  const resend = getResendClient()
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!audienceId) return

  try {
    await resend.contacts.remove({ audienceId, email })
  } catch (err) {
    console.error('[Resend] Failed to remove contact:', err)
  }
}
