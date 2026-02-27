import { getResendClient } from './resend'

export async function syncContactToResend(params: {
  email: string
  firstName?: string
  lastName?: string
}) {
  const resend = getResendClient()
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!audienceId) {
    console.error('[Resend] Missing RESEND_AUDIENCE_ID')
    return
  }

  try {
    await resend.contacts.create({
      audienceId,
      email: params.email,
      firstName: params.firstName || undefined,
      lastName: params.lastName || undefined,
    })
  } catch (err) {
    // Resend returns 409 if contact already exists - that's fine
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
