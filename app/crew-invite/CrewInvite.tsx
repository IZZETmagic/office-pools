'use client'

// An email invite, opened from its one-time link. The link is the proof — whoever can read the inbox
// it went to — not the address anyone signs up with (email confirmation is off; R36, migration 155).
//
//   signed out → who asked and which crew, then Sign up / Log in, both returning here
//   signed in  → Join / No thanks, which claim and answer the invite in one request
//
// Opening the page answers nothing: only a button press does (mail scanners pre-fetch links).
//
// ⚠ The token arrives after the '#', and on arrival it moves into localStorage and out of the address
// bar. Sign up / Log in return to the bare page, which reads it back — it is never put in a
// `?redirectTo=` or any other URL a server or analytics would see. See lib/crews/inviteLink.ts.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { crewRequest, errorText } from '@/lib/crews/client'
import { CLAIM_BLOCK_TEXT } from '@/lib/crews/rules'
import type { InviteLinkView } from '@/lib/crews/store'
import { INVITE_PAGE, INVITE_TOKEN_KEY, LOG_IN_HREF, SIGN_UP_HREF } from '@/lib/crews/inviteLink'
import { plural } from '@/lib/crews/words'

type View = InviteLinkView & { signedIn: boolean }

function storedToken(): string {
  try {
    return window.localStorage.getItem(INVITE_TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}
function forgetToken() {
  try {
    window.localStorage.removeItem(INVITE_TOKEN_KEY)
  } catch {
    /* storage blocked — nothing was kept */
  }
}
const subscribeToken = (notify: () => void) => {
  window.addEventListener('hashchange', notify)
  window.addEventListener('storage', notify)
  return () => {
    window.removeEventListener('hashchange', notify)
    window.removeEventListener('storage', notify)
  }
}
/** The link's token: still in the address bar on the first pass, from storage after that. */
const currentToken = () => window.location.hash.slice(1) || storedToken()

export function CrewInvite() {
  const router = useRouter()
  // null on the server and the first client pass; then the token, or '' when there is none.
  const token = useSyncExternalStore(subscribeToken, currentToken, () => null)
  const [loaded, setLoaded] = useState<{ token: string; view: View | null } | null>(null)
  const [busy, setBusy] = useState<'join' | 'decline' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [declined, setDeclined] = useState<{ crewName: string; signedIn: boolean } | null>(null)

  // Move the token out of the address bar and into storage, so nothing that reads the URL from here
  // on — the sign-up round trip, a copied address, a screenshot — carries it. If storage is blocked
  // it stays in the hash: this visit still works, and signing up means opening the email again.
  useEffect(() => {
    function take() {
      const fromHash = window.location.hash.slice(1)
      if (!fromHash) return
      try {
        window.localStorage.setItem(INVITE_TOKEN_KEY, fromHash)
      } catch {
        return
      }
      window.history.replaceState(window.history.state, '', INVITE_PAGE)
    }
    take()
    window.addEventListener('hashchange', take)
    return () => window.removeEventListener('hashchange', take)
  }, [])

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
    let crewId: string
    try {
      crewId = (await crewRequest<{ crewId: string }>('/api/crews/invites/claim', { body: { token, answer: a } })).crewId
    } catch (e) {
      setProblem(errorText(e))
      setBusy(null)
      return
    }
    // Answered — the link is spent, so it has no business staying in this browser.
    forgetToken()
    if (a === 'join') {
      // Busy stays on while the crew page loads: re-rendering here would read the now-empty token
      // and flash "isn't complete" on the way out.
      router.push(`/crews/${encodeURIComponent(crewId)}`)
      return
    }
    const view = loaded?.view
    setDeclined({ crewName: view?.state === 'open' ? view.crewName : 'this crew', signedIn: !!view?.signedIn })
    setBusy(null)
  }


  if (declined) {
    return (
      <Message
        title="No problem"
        body={`You won’t be added to ${declined.crewName}, and we won’t email you about it again.`}
        action={declined.signedIn ? { label: 'Go to your dashboard', href: '/dashboard' } : undefined}
      />
    )
  }
  if (token === '') return <Message title="This invite link isn’t complete" body="Open it again from the email we sent — the whole link, please." />
  const view = loaded && loaded.token === token ? loaded.view : undefined
  if (token === null || view === undefined) return <p className="t-body text-muted text-center">Opening your invite…</p>
  if (view === null) return <Message title="We couldn’t open this invite" body="Please try the link again in a moment." />
  if (view.state === 'invalid') return <Message title="This invite link isn’t valid" body="Open it again from the email we sent — the whole link, please." />
  if (view.state === 'used') return <Message title="This invite has already been used" body="Each invite link works once. If it was meant for you, ask whoever invited you to add you again." />
  if (view.state === 'closed') return <Message title="This crew has closed" body="Everyone left, so there’s nothing to join any more." />
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
          <Button href={SIGN_UP_HREF} fullWidth>
            Sign up
          </Button>
          <p className="text-sm text-muted">
            Already on SportPool?{' '}
            <Link href={LOG_IN_HREF} className="font-semibold text-primary-600 hover:underline">
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
