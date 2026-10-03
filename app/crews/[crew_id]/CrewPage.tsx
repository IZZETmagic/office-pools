'use client'

// The web crew page. Mirrors mobile/app/profile/crews/[id].tsx section for section: the basic page
// shipped in plan §8a, and the captain's controls joined it in §8b.
//
// The rules it shows (Ryan, 2026-10-02):
//   · Captain + co-captain add people (by exact username or email — AddPeopleModal), remove people,
//     and rename; the captain alone names the co-captain. Removal is silent and keeps history.
//   · Anyone in the crew can join a running season they're not in, from here.
//   · Leaving is one tap; history stays; the captaincy passes on (said before the tap). Someone who
//     left can open this page and Rejoin; the removed can't see it at all (the page 404s).
//   · Seasons · titles · best finish — never summed points. Last Man Standing has no rank.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { AddPeopleModal } from '@/components/crews/AddPeopleModal'
import { CrewFace } from '@/components/crews/CrewFace'
import { NameCrewModal } from '@/components/crews/NameCrewModal'
import { AppHeader } from '@/components/ui/AppHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import { crewRequest, errorText } from '@/lib/crews/client'
import type { CrewDetail, LinkablePool } from '@/lib/crews/read'
import {
  DISBAND_CONSEQUENCE,
  DISBANDED_NOTICE,
  LINK_CONSEQUENCE,
  LINK_HINT,
  linkablePeopleText,
  finishText,
  leaveConsequence,
  monthYear,
  ordinal,
  personName,
  plural,
  roleLabel,
  shortName,
  winnersText,
} from '@/lib/crews/words'

type Member = CrewDetail['members'][number]

export function CrewPage({
  crew,
  viewerId,
  viewerName,
  isSuperAdmin,
}: {
  crew: CrewDetail
  viewerId: string
  /** Who an email invite will say asked — the viewer. */
  viewerName: string
  isSuperAdmin: boolean
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const [choosingCo, setChoosingCo] = useState(false)
  const [selected, setSelected] = useState<Member | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null)
  const [confirmDisband, setConfirmDisband] = useState(false)
  const [linking, setLinking] = useState<LinkablePool | null>(null)

  const v = crew.viewer
  const captain = crew.members.find((m) => m.role === 'captain') ?? null
  const co = crew.members.find((m) => m.role === 'co_captain') ?? null
  const crewUrl = `/api/crews/${encodeURIComponent(crew.crew.crewId)}`

  /** Run one request, then go somewhere or re-read the page. A failure keeps everything and says why. */
  async function act<T>(request: () => Promise<T>, after: (data: T) => void = () => router.refresh()) {
    if (busy) return
    setBusy(true)
    try {
      after(await request())
    } catch (e) {
      showToast(errorText(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  /** What tapping a member offers — the same rules as the app (and the API, which enforces them). */
  function memberOptions(m: Member): Array<{ id: 'co_captain' | 'remove'; label: string }> {
    const out: Array<{ id: 'co_captain' | 'remove'; label: string }> = []
    if (v.canSetCoCaptain && m.role === 'member') out.push({ id: 'co_captain', label: 'Make co-captain' })
    if (v.canManage && m.role !== 'captain' && (m.role === 'member' || v.role === 'captain')) {
      out.push({ id: 'remove', label: 'Remove from crew' })
    }
    return out
  }

  const setCoCaptain = (userId: string) =>
    act(() => crewRequest(`${crewUrl}/co-captain`, { body: { user_id: userId } }))

  // Disbanded (157): only its captain can open it, and the only thing left to do is bring it back.
  if (crew.crew.disbandedAt) {
    const when = monthYear(crew.crew.disbandedAt)
    return (
      <div className="min-h-screen bg-surface-secondary">
        <AppHeader isSuperAdmin={isSuperAdmin} breadcrumbs={[{ label: 'Crews', href: '/profile?tab=crews' }, { label: crew.crew.name }]} />
        <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
          <h1 className="text-[26px] font-black text-ink leading-tight break-words">{crew.crew.name}</h1>
          <Card>
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-bold text-ink">You disbanded this crew{when ? ` · ${when}` : ''}</p>
              <p className="text-[13px] leading-[18px] text-muted">{DISBANDED_NOTICE}</p>
              {v.canRestore ? (
                <Button
                  onClick={() => void act(() => crewRequest(`${crewUrl}/restore`, { body: {} }))}
                  loading={busy}
                  loadingText="Restoring…"
                  className="self-start"
                >
                  Restore crew
                </Button>
              ) : null}
            </div>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader
        isSuperAdmin={isSuperAdmin}
        breadcrumbs={[{ label: 'Crews', href: '/profile?tab=crews' }, { label: crew.crew.name }]}
      />

      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {!v.active && v.canRejoin ? (
          <Card>
            <div className="flex flex-col gap-3">
              <p className="text-[15px] font-bold text-ink">You left this crew</p>
              <p className="text-[13px] text-muted">Rejoin to get a saved spot next season again. Your history is still here.</p>
              <Button
                onClick={() => void act(() => crewRequest(`${crewUrl}/rejoin`, { body: {} }))}
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
          <div className="flex items-start gap-3">
            <h1 className="flex-1 min-w-0 text-[26px] font-black text-ink leading-tight break-words">{crew.crew.name}</h1>
            {v.canManage ? (
              <button
                type="button"
                onClick={() => setRenaming(true)}
                className="mt-2 text-[13px] font-bold text-primary-600 hover:text-primary-700"
              >
                Rename
              </button>
            ) : null}
          </div>
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

        {v.role === 'captain' && !co && crew.members.length > 1 ? (
          <button
            type="button"
            onClick={() => setChoosingCo(true)}
            className="flex items-center gap-2 rounded-control bg-warning-100 dark:bg-warning-500/15 p-4 text-left hover:opacity-80 transition-opacity"
          >
            <Icon name="star.fill" size={15} className="text-warning-600 shrink-0" />
            <span className="flex-1 text-[13px] leading-[18px] text-ink">
              <strong className="font-bold">Pick a co-captain</strong>, so the crew isn’t stuck if you’re away.
            </span>
            <Icon name="chevron.right" size={12} weight="semibold" className="text-muted" />
          </button>
        ) : null}

        {/* Section order — Ryan, 2026-10-03: All-time, the crew (and its invites), playing now,
            past seasons, then the pools that could be linked. Same as the app. */}
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

        <Section
          title="The crew"
          action={v.canManage ? { label: 'Add people', onClick: () => setAdding(true) } : undefined}
          hint={
            v.canManage
              ? 'Only you and your co-captain see who’s invited. Click someone to make them co-captain or remove them — removed people aren’t told, and their history stays.'
              : 'The captain and co-captain add people by username or email. Anyone who plays in one of the crew’s pools is in automatically.'
          }
        >
          <Card>
            <ul className="grid grid-cols-4 sm:grid-cols-5 gap-y-4">
              {crew.members.map((m) => {
                const label = roleLabel(m.role)
                const tappable = memberOptions(m).length > 0
                const inner = (
                  <>
                    <CrewFace person={m} size={44} />
                    <span className="max-w-[92%] truncate text-[11.5px] font-bold text-ink">{m.userId === viewerId ? 'You' : shortName(m)}</span>
                    {label ? <span className="text-[8.5px] font-black tracking-[0.5px] text-warning-700">{label.toUpperCase()}</span> : null}
                  </>
                )
                const a11y = `${personName(m)}${label ? `, ${label}` : ''}`
                return (
                  <li key={m.userId} className="min-w-0">
                    {tappable ? (
                      <button
                        type="button"
                        onClick={() => setSelected(m)}
                        aria-label={a11y}
                        className="w-full flex flex-col items-center gap-1 rounded-control py-1 hover:bg-mist/60 transition-colors"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className="flex flex-col items-center gap-1 py-1" aria-label={a11y}>
                        {inner}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </Card>

          {v.canManage && crew.invites && crew.invites.length > 0 ? (
            <Card padding="none">
              <p className="px-4 pt-3 pb-1 text-[10px] font-black tracking-[0.6px] text-muted">INVITED · WAITING</p>
              <ul>
                {crew.invites.map((inv, i) => (
                  <li key={inv.inviteId} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                    {inv.invitee ? <CrewFace person={inv.invitee} size={28} /> : <Icon name="envelope.fill" size={18} className="text-muted" />}
                    <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">
                      {inv.invitee ? personName(inv.invitee) : inv.email}
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(() => crewRequest(`/api/crews/invites/${encodeURIComponent(inv.inviteId)}`, { method: 'DELETE' }))
                      }
                      className="text-[12.5px] font-bold text-danger-600 hover:text-danger-700 disabled:opacity-50"
                    >
                      Withdraw
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </Section>

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
                          void act(
                            () => crewRequest('/api/pools/join', { body: { pool_id: p.poolId } }),
                            () => router.push(`/pools/${encodeURIComponent(p.poolId)}`),
                          )
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

        {/* Pools the captain/co-captain runs with nobody outside the crew in them (2026-10-03).
            Offered, never linked unasked; the server re-checks every condition on Link. */}
        {crew.linkable && crew.linkable.length ? (
          <Section title="Also playing together" hint={LINK_HINT}>
            <Card padding="none">
              {crew.linkable.map((p, i) => (
                <div key={p.poolId} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-border-subtle' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-ink truncate">{p.poolName}</p>
                    <p className="text-xs font-medium text-muted truncate">
                      {p.competition} · {linkablePeopleText(p.players, crew.members.length)}
                    </p>
                  </div>
                  <Button size="xs" className="rounded-pill" disabled={busy} onClick={() => setLinking(p)}>
                    Link
                  </Button>
                </div>
              ))}
            </Card>
          </Section>
        ) : null}

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
        {/* The captain alone (157), always behind a confirmation that says what it does to everyone. */}
        {v.canDisband ? (
          <div className="flex justify-center -mt-4">
            <button
              type="button"
              onClick={() => setConfirmDisband(true)}
              className="text-sm font-bold text-danger-600 hover:text-danger-700 px-2 py-1 rounded-control"
            >
              Disband crew
            </button>
          </div>
        ) : null}
      </main>

      {/* ── Dialogs ── */}

      {adding ? (
        <AddPeopleModal
          isOpen
          crewId={crew.crew.crewId}
          crewName={crew.crew.name}
          inviterName={viewerName}
          onClose={() => setAdding(false)}
          onChanged={() => router.refresh()}
        />
      ) : null}

      {renaming ? (
        <NameCrewModal
          title="Rename the crew"
          description="Everyone in the crew sees the new name."
          initialName={crew.crew.name}
          confirmLabel="Save"
          onClose={() => setRenaming(false)}
          onSubmit={async (name) => {
            if (name !== crew.crew.name) await crewRequest(crewUrl, { method: 'PATCH', body: { name } })
            setRenaming(false)
            router.refresh()
          }}
        />
      ) : null}

      <Modal isOpen={selected !== null} onClose={() => setSelected(null)} size="sm" titleId="member-title">
        {selected ? (
          <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <CrewFace person={selected} size={40} />
              <h2 id="member-title" className="t-card-title text-ink truncate">
                {personName(selected)}
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {memberOptions(selected).map((o) => (
                <Button
                  key={o.id}
                  variant={o.id === 'remove' ? 'secondary' : 'primary'}
                  className={o.id === 'remove' ? 'text-danger-600' : ''}
                  onClick={() => {
                    const m = selected
                    setSelected(null)
                    if (o.id === 'co_captain') void setCoCaptain(m.userId)
                    else setConfirmRemove(m)
                  }}
                >
                  {o.label}
                </Button>
              ))}
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={choosingCo} onClose={() => setChoosingCo(false)} size="sm" titleId="co-title">
        <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="co-title" className="t-card-title text-ink">
              Pick a co-captain
            </h2>
            <p className="t-body text-muted">They can add and remove people and rename the crew, and take over if you leave.</p>
          </div>
          <ul className="rounded-control border border-border-default divide-y divide-border-subtle overflow-hidden max-h-[50vh] overflow-y-auto">
            {crew.members
              .filter((m) => m.role === 'member')
              .map((m) => (
                <li key={m.userId}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setChoosingCo(false)
                      void setCoCaptain(m.userId)
                    }}
                    className="w-full flex items-center gap-3 p-3 text-left hover:bg-mist/60 transition-colors"
                  >
                    <CrewFace person={m} size={32} />
                    <span className="flex-1 min-w-0 truncate text-sm font-bold text-ink">{personName(m)}</span>
                  </button>
                </li>
              ))}
          </ul>
          <Button variant="secondary" onClick={() => setChoosingCo(false)}>
            Cancel
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmRemove !== null}
        title={confirmRemove ? `Remove ${shortName(confirmRemove)}?` : ''}
        body="They’ll stop getting a saved spot. They won’t be told, and their history stays."
        confirmLabel="Remove"
        busyLabel="Removing…"
        busy={busy}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const m = confirmRemove
          if (!m) return
          void act(
            () => crewRequest(`${crewUrl}/members/${encodeURIComponent(m.userId)}/remove`, { body: {} }),
            () => {
              setConfirmRemove(null)
              router.refresh()
            },
          )
        }}
      />

      <Modal isOpen={linking !== null} onClose={() => setLinking(null)} size="sm" titleId="link-title">
        <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 id="link-title" className="t-card-title text-ink">
              {linking ? `Link ${linking.poolName}?` : ''}
            </h2>
            <p className="t-body text-muted">{LINK_CONSEQUENCE}</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
            <Button variant="secondary" onClick={() => setLinking(null)} disabled={busy}>
              Not now
            </Button>
            <Button
              loading={busy}
              loadingText="Linking…"
              onClick={() => {
                const p = linking
                if (!p) return
                void act(
                  () => crewRequest(`${crewUrl}/link-pool`, { body: { pool_id: p.poolId } }),
                  () => {
                    setLinking(null)
                    router.refresh()
                  },
                )
              }}
            >
              Link
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDisband}
        title={`Disband ${crew.crew.name}?`}
        body={DISBAND_CONSEQUENCE}
        confirmLabel="Disband"
        cancelLabel="Keep it"
        busyLabel="Disbanding…"
        busy={busy}
        onCancel={() => setConfirmDisband(false)}
        onConfirm={() =>
          // Stays on this page: the refresh answers with the disbanded view and its Restore.
          void act(
            () => crewRequest(`${crewUrl}/disband`, { body: {} }),
            () => {
              setConfirmDisband(false)
              router.refresh()
            },
          )
        }
      />

      <ConfirmModal
        open={confirmLeave}
        title={`Leave ${crew.crew.name}?`}
        body={leaveConsequence(crew)}
        confirmLabel="Leave"
        cancelLabel="Stay"
        busyLabel="Leaving…"
        busy={busy}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() =>
          void act(
            () => crewRequest<{ closed?: boolean }>(`${crewUrl}/leave`, { body: {} }),
            (data) => {
              setConfirmLeave(false)
              // The last one out closes the crew, and a closed crew has no page.
              if (data.closed === true) router.push('/profile?tab=crews')
              else router.refresh()
            },
          )
        }
      />
    </div>
  )
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string
  hint?: string
  action?: { label: string; onClick: () => void }
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[11px] font-black tracking-[0.6px] text-muted uppercase">{title}</h2>
        {action ? (
          <button type="button" onClick={action.onClick} className="text-[13px] font-bold text-primary-600 hover:text-primary-700">
            {action.label}
          </button>
        ) : null}
      </div>
      {children}
      {hint ? <p className="text-xs text-muted px-1">{hint}</p> : null}
    </section>
  )
}

function ConfirmModal({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  busyLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  busyLabel: string
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Modal isOpen={open} onClose={onCancel} size="sm" titleId="confirm-title">
      <div className="px-5 sm:px-6 pt-4 pb-6 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 id="confirm-title" className="t-card-title text-ink">
            {title}
          </h2>
          <p className="t-body text-muted">{body}</p>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant="danger" loading={busy} loadingText={busyLabel} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
