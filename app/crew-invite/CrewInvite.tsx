'use client'

// An email invite, opened from its one-time link. The link is the proof — whoever can read the inbox
// it went to — not the address anyone signs up with (email confirmation is off; R36, migration 155).
//
//   signed out → who asked and which crew, then Sign up / Log in, both returning here
//   signed in  → Join / No thanks, which claim and answer the invite in one request
//
// Opening the page answers nothing: only a button press does. (Mail scanners pre-fetch links, and a
// fragment never reaches a server anyway.)

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { crewRequest, errorText } from '@/lib/crews/client'
import { CLAIM_BLOCK_TEXT } from '@/lib/crews/rules'
import type { InviteLinkView } from '@/lib/crews/store'
import { plural } from '@/lib/crews/words'

type View = InviteLinkView & { signedIn: boolean }

const subscribeHash = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  return () => window.removeEventListener('hashchange', notify)
}

export function CrewInvite() {
  const router = useRouter()
  // null on the server and the first client pass; then whatever follows the '#'.
  const token = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => null)
  const [loaded, setLoaded] = useState<{ token: string; view: View | null } | null>(null)
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [declined, setDeclined] = useState(false)

  useEffect(() => {
    if (!token) return
    let cancelled = false
    crewRequest<View>('/api/crews/invites/link', { body: { token } })
      .then((view) => {
        if (!cancelled) setLoaded({ token, view })
      })
      .catch(() => {
        if (!cancelled) setLoaded({ token, view: null })
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function answer(a: 'join' | 'decline') {
    if (!token || busy) return
    setBusy(a)
    setProblem(null)
    try {
      const { crewId } = await crewRequest<{ crewId: string }>('/api/crews/invites/claim', { body: { token, answer: a } })
      if (a === 'join') router.push(`/crews/${encodeURIComponent(crewId)}`)
      else setDeclined(true)
    } catch (e) {
      setProblem(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  if (token === '') return <Message title="This invite link isn’t complete" body="Open it again from the email we sent — the whole link, please." />
  const view = loaded && loaded.token === token ? loaded.view : undefined
  if (token === null || view === undefined) return <p className="t-body text-muted text-center">Opening your invite…</p>
  if (view === null) return <Message title="We couldn’t open this invite" body="Please try the link again in a moment." />
  if (view.state === 'invalid') return <Message title="This invite link isn’t valid" body="Open it again from the email we sent — the whole link, please." />
  if (view.state === 'used') return <Message title="This invite has already been used" body="Each invite link works once. If it was meant for you, ask whoever invited you to add you again." />
  if (view.state === 'closed') return <Message title="This crew has closed" body="Everyone left, so there’s nothing to join any more." />
  if (declined) {
    return (
      <Message
        title="No problem"
        body={`You won’t be added to ${view.crewName}, and we won’t email you about it again.`}
        action={view.signedIn ? { label: 'Go to your dashboard', href: '/dashboard' } : undefined}
      />
    )
  }

  // Back here after signing up or logging in, fragment and all.
  const here = `/crew-invite#${token}`
  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-14 h-14 rounded-card bg-primary-600/10 flex items-center justify-center">
          <Icon name="person.3.fill" size={26} className="text-primary-600" weight="semibold" />
        </div>
        <h1 className="t-card-title text-ink">You’re invited to {view.crewName}</h1>
        <p className="t-body text-muted">
          {view.inviter} asked us to invite you. {plural(view.people, 'person plays', 'people play')} prediction pools
          together in this crew, season after season.
        </p>
      </div>

      {!view.signedIn ? (
        <div className="flex flex-col gap-2">
          <Button href={`/signup?redirectTo=${encodeURIComponent(here)}`} fullWidth>
            Sign up
          </Button>
          <p className="text-sm text-muted">
            Already on SportPool?{' '}
            <Link href={`/login?redirectTo=${encodeURIComponent(here)}`} className="font-semibold text-primary-600 hover:underline">
              Log in
            </Link>
          </p>
        </div>
      ) : view.block ? (
        <Message title={CLAIM_BLOCK_TEXT[view.block]} body="" action={{ label: 'Go to your dashboard', href: '/dashboard' }} bare />
      ) : (
        <div className="flex flex-col gap-2">
          <Button onClick={() => void answer('join')} loading={busy === 'join'} disabled={busy !== null} fullWidth>
            Join {view.crewName}
          </Button>
          <Button variant="secondary" onClick={() => void answer('decline')} loading={busy === 'decline'} disabled={busy !== null} fullWidth>
            No thanks
          </Button>
          <p className="text-xs text-muted">
            Join once and you’ll get a saved spot whenever any of them starts a pool. No thanks, and they can’t add you
            again.
          </p>
        </div>
      )}

      {problem ? <p className="text-sm text-danger-700 bg-danger-50 rounded-control p-3">{problem}</p> : null}
    </div>
  )
}

function Message({
  title,
  body,
  action,
  bare = false,
}: {
  title: string
  body: string
  action?: { label: string; href: string }
  bare?: boolean
}) {
  return (
    <div className={`flex flex-col gap-3 text-center ${bare ? '' : 'py-2'}`}>
      <h1 className="t-card-title text-ink">{title}</h1>
      {body ? <p className="t-body text-muted">{body}</p> : null}
      {action ? (
        <Button href={action.href} variant="secondary" fullWidth>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}
