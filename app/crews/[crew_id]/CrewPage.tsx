'use client'

// The web crew page — the basic one (plan §8a). Mirrors mobile/app/profile/crews/[id].tsx section
// for section, minus the captain's controls, which come with 8b.
//
// The rules it shows (Ryan, 2026-10-02):
//   · Anyone in the crew can join a running season they're not in, from here.
//   · Leaving is one tap; history stays; the captaincy passes on (said before the tap). Someone who
//     left can open this page and Rejoin; the removed can't see it at all (the page 404s).
//   · Seasons · titles · best finish — never summed points. Last Man Standing has no rank.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AppHeader } from '@/components/ui/AppHeader'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import type { CrewDetail, Person } from '@/lib/crews/read'
import { finishText, leaveConsequence, ordinal, personName, plural, roleLabel, shortName, winnersText } from '@/lib/crews/words'

/** The shared web Avatar takes the database's snake_case. */
const face = (p: Person) => ({ user_id: p.userId, full_name: p.fullName, username: p.username, avatar_colour: p.avatarColour })

export function CrewPage({ crew, viewerId, isSuperAdmin }: { crew: CrewDetail; viewerId: string; isSuperAdmin: boolean }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const v = crew.viewer
  const captain = crew.members.find((m) => m.role === 'captain') ?? null
  const co = crew.members.find((m) => m.role === 'co_captain') ?? null
  const crewUrl = `/api/crews/${encodeURIComponent(crew.crew.crewId)}`

  /** POST, then either go somewhere or re-read the page. A failure keeps everything and says why. */
  async function act(url: string, body: Record<string, unknown>, after: (data: Record<string, unknown>) => void) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      if (!res.ok) {
        showToast(typeof data.error === 'string' ? data.error : 'That didn’t work. Please try again.', 'error')
        return
      }
      after(data)
    } catch {
      showToast('That didn’t work. Please try again.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader isSuperAdmin={isSuperAdmin} breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: crew.crew.name }]} />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {!v.active && v.canRejoin ? (
          <Card>
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-bold text-ink">You left this crew</p>
              <p className="text-[13px] text-muted">Rejoin to get a saved spot next season again. Your history is still here.</p>
              <Button
                onClick={() => void act(`${crewUrl}/rejoin`, {}, () => router.refresh())}
                loading={busy}
                loadingText="Rejoining…"
                className="self-start"
              >
                Rejoin
              </Button>
            </div>
          </Card>
        ) : null}

        <header className="flex flex-col gap-1">
          <h1 className="text-[26px] font-black text-ink leading-tight break-words">{crew.crew.name}</h1>
          <p className="text-[13px] font-medium text-muted">
            {[
              plural(crew.members.length, 'person', 'people'),
              captain ? `Captain ${v.role === 'captain' ? 'you' : shortName(captain)}` : null,
              co ? `Co-captain ${v.role === 'co_captain' ? 'you' : shortName(co)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </header>

        {crew.playingNow.length ? (
          <Section title="Playing now" hint="Any member can start a pool for the crew — whoever starts it runs that season.">
            <Card padding="none">
              {crew.playingNow.map((p, i) => {
                const body = (
                  <>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-ink">{p.competition}</p>
                      <p className="text-xs font-medium text-muted truncate">
                        {p.poolName} · {plural(p.players, 'player')} · run by {p.runBy.userId === viewerId ? 'you' : shortName(p.runBy)}
                      </p>
                      {p.seat === 'open' ? <p className="text-[11.5px] font-bold text-primary-600">Your spot’s saved</p> : null}
                    </div>
                    {p.viewerIn ? (
                      <>
                        {p.viewerRank !== null ? (
                          <div className="text-right">
                            <p className="text-[17px] font-black text-ink leading-none">{ordinal(p.viewerRank)}</p>
                            <p className="text-[10.5px] font-medium text-muted">you</p>
                          </div>
                        ) : null}
                        <Icon name="chevron.right" size={12} weight="semibold" className="text-muted" />
                      </>
                    ) : p.joinable ? (
                      <Button
                        size="xs"
                        className="rounded-pill"
                        disabled={busy}
                        onClick={() =>
                          // Joining a crew pool with an open seat takes the seat (lib/pools/join.ts).
                          void act('/api/pools/join', { pool_id: p.poolId }, () => router.push(`/pools/${encodeURIComponent(p.poolId)}`))
                        }
                      >
                        {p.seat === 'open' ? 'I’m in' : 'Join'}
                      </Button>
                    ) : null}
                  </>
                )
                const row = `flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border-subtle' : ''}`
                return p.viewerIn ? (
                  <Link key={p.poolId} href={`/pools/${encodeURIComponent(p.poolId)}`} className={`${row} hover:bg-mist/50 transition-colors`}>
                    {body}
                  </Link>
                ) : (
                  <div key={p.poolId} className={row}>
                    {body}
                  </div>
                )
              })}
            </Card>
          </Section>
        ) : null}

        {crew.allTime.length ? (
          <Section title="All-time" hint="Seasons, titles and best finish — never points added up across different games.">
            <Card padding="none">
              {/* Fixed-width number columns, as the app draws it: a table's auto layout let the
                  name column squeeze the headings into one word. */}
              <div className="flex items-center gap-3 px-4 pt-3 pb-1 text-[10px] font-black tracking-[0.6px] text-muted" aria-hidden>
                <span className="w-5" />
                <span className="flex-1" />
                <span className="w-16 text-right">SEASONS</span>
                <span className="w-16 text-right">TITLES</span>
                <span className="w-16 text-right">BEST</span>
              </div>
              <ol>
                {crew.allTime.map((r, i) => (
                  <li
                    key={r.userId}
                    className={`flex items-center gap-3 px-4 py-2.5 text-sm ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                    aria-label={`${i + 1}. ${personName(r)}: ${plural(r.seasons, 'season')}, ${plural(r.titles, 'title')}, best ${r.best === null ? 'none' : ordinal(r.best)}`}
                  >
                    <span className="w-5 text-[13px] font-black text-muted">{i + 1}</span>
                    <span className="flex-1 min-w-0 truncate font-bold text-ink">{r.userId === viewerId ? 'You' : shortName(r)}</span>
                    <span className="w-16 text-right font-bold text-ink tabular-nums">{r.seasons}</span>
                    <span className="w-16 text-right font-bold text-ink tabular-nums">{r.titles}</span>
                    <span className="w-16 text-right font-bold text-ink tabular-nums">{r.best === null ? '—' : ordinal(r.best)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </Section>
        ) : null}

        {crew.pastSeasons.length ? (
          <Section title="Past seasons">
            <Card padding="none">
              {crew.pastSeasons.map((p, i) => (
                <Link
                  key={p.poolId}
                  href={`/pools/${encodeURIComponent(p.poolId)}`}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-mist/50 transition-colors ${i > 0 ? 'border-t border-border-subtle' : ''}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink">{p.competition}</p>
                    <p className="text-[11.5px] font-medium text-muted truncate">{[p.poolName, winnersText(p.winners)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className="text-[12.5px] font-bold text-muted">{finishText(p.viewerRank, p.players)}</span>
                </Link>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section
          title="The crew"
          hint={
            v.canManage
              ? 'Adding people, renaming the crew and picking a co-captain are in the SportPool app for now.'
              : 'The captain and co-captain add people by username or email. Anyone who plays in one of the crew’s pools is in automatically.'
          }
        >
          <Card>
            <ul className="grid grid-cols-4 sm:grid-cols-5 gap-y-4">
              {crew.members.map((m) => {
                const label = roleLabel(m.role)
                return (
                  <li key={m.userId} className="flex flex-col items-center gap-1 min-w-0" aria-label={`${personName(m)}${label ? `, ${label}` : ''}`}>
                    <Avatar person={face(m)} size={44} />
                    <span className="max-w-[92%] truncate text-[11.5px] font-bold text-ink">{m.userId === viewerId ? 'You' : shortName(m)}</span>
                    {label ? <span className="text-[8.5px] font-black tracking-[0.5px] text-warning-700">{label.toUpperCase()}</span> : null}
                  </li>
                )
              })}
            </ul>
          </Card>
        </Section>

        {v.active ? (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="text-sm font-bold text-danger-600 hover:text-danger-700 px-2 py-1 rounded-control"
            >
              Leave crew
            </button>
          </div>
        ) : null}
      </main>

      <Modal isOpen={confirmLeave} onClose={() => setConfirmLeave(false)} size="sm" titleId="leave-crew-title">
        <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="leave-crew-title" className="t-card-title text-ink">
              Leave {crew.crew.name}?
            </h2>
            <p className="t-body text-muted">{leaveConsequence(crew)}</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="secondary" onClick={() => setConfirmLeave(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              loadingText="Leaving…"
              onClick={() =>
                void act(`${crewUrl}/leave`, {}, (data) => {
                  setConfirmLeave(false)
                  // The last one out closes the crew, and a closed crew has no page.
                  if (data.closed === true) router.push('/dashboard')
                  else router.refresh()
                })
              }
            >
              Leave
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[11px] font-black tracking-[0.6px] text-muted uppercase px-1">{title}</h2>
      {children}
      {hint ? <p className="text-xs text-muted px-1">{hint}</p> : null}
    </section>
  )
}
