import type { Metadata } from 'next'

import { AuthLayout } from '@/components/ui/AuthLayout'

import { CrewInvite } from './CrewInvite'

// Where an email invite's one-time link lands (migration 155): /crew-invite#<token>.
//
// Public on purpose — the person opening it usually has no account yet — and so NOT under /crews,
// which the proxy keeps behind login. Everything here is read in the browser: the token is in the
// URL fragment, which the server never sees (see lib/crews/notify.inviteLinkUrl).

export const metadata: Metadata = { title: 'Crew invite', robots: { index: false, follow: false } }

export default function CrewInvitePage() {
  return (
    <AuthLayout>
      <CrewInvite />
    </AuthLayout>
  )
}
