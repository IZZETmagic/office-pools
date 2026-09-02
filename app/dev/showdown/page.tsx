'use client'

// =============================================================
// SHOWDOWN STATE HARNESS — dev only
// =============================================================
// The band has four states and three of them are rare: sealed lasts 48 hours a
// week, the reveal window a few hours, and "in play" only while a ball is
// actually being kicked. Waiting for real data to look at any of them is a bad
// way to design them.
//
// ⚠ IT DRIVES THE REAL COMPONENTS. `ShowdownBand` and `DuelRevealCeremony` are
// the shipped ones, given hand-made props — so what you see here is what the
// pool page renders, not a mock that can drift away from it. The only thing
// faked is the data.
//
// ⚠ 404s IN PRODUCTION. `/dev/*` is not behind the tester allowlist and would
// otherwise be a public route on sportpool.io. The guard is the build mode, not
// a flag someone can forget to set.
// =============================================================

import { notFound } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import { ShowdownBand } from '../../pools/[pool_id]/ShowdownBand'
import { DuelRevealCeremony, type RevealOpponent } from '../../pools/[pool_id]/DuelRevealCeremony'
import type { AvatarPerson } from '@/components/ui/Avatar'

/** Two real seeded testers, so the colours and initials are the app's own. */
const YOU: AvatarPerson = {
  user_id: 'b95acab7-1e48-418e-8a77-2c084c30db94',
  full_name: 'Priya Nair',
  username: 'Priya',
}
const THEM: AvatarPerson = {
  user_id: '047b7f8a-be8a-4555-b632-d34e01845532',
  full_name: 'Sarah Chen',
  username: 'Sarah C',
}

const OPPONENT: RevealOpponent = {
  name: 'Sarah Chen',
  person: THEM,
  record: { won: 1, tied: 0, lost: 0 },
  duelPoints: 500,
  rank: 1,
}

type State = 'sealed' | 'revealed' | 'inplay'

/** How far out the countdown sits. The formatting changes across these. */
type Horizon = { label: string; ms: number }
/**
 * ⚠ THE 10-SECOND ONE IS THE POINT OF THIS PAGE. The others only show how the
 * clock FORMATS at each scale; ten seconds is short enough to sit and watch it
 * reach zero, which is the only way to see the hand-off — sealed clock runs
 * out, band becomes a Reveal button, press it, meet them.
 */
const HORIZONS: Horizon[] = [
  { label: '10 seconds', ms: 10_000 },
  { label: '30 seconds', ms: 30_000 },
  { label: '9 minutes', ms: 9 * 60_000 },
  { label: '3 hours', ms: 3 * 3_600_000 },
  { label: '2 days', ms: 2 * 86_400_000 },
]
const DEFAULT_HORIZON = HORIZONS[0]

export default function Page() {
  if (process.env.NODE_ENV === 'production') notFound()

  const [state, setState] = useState<State>('sealed')
  const [horizon, setHorizon] = useState<Horizon>(DEFAULT_HORIZON)
  const [ceremonyOpen, setCeremonyOpen] = useState(false)
  const [bye, setBye] = useState(false)
  /**
   * Has the walkout been played? Mirrors `revealSeen` in DuelsTab — the shipped
   * one reads localStorage per duel; here it is plain state so every press of
   * "Run it again" starts you back at not-knowing.
   */
  const [seen, setSeen] = useState(false)
  // ⚠ Set once, not recomputed each render — a countdown whose target moves
  // every render never counts down.
  const [target, setTarget] = useState(() => new Date(Date.now() + DEFAULT_HORIZON.ms).toISOString())

  /**
   * Put it back to the top of the journey.
   *
   * ⚠ `useCallback` IS LOAD-BEARING, not tidiness. As a bare function in the
   * component body the React Compiler lint reads it as render-phase code and
   * rejects the `Date.now()` inside it — "Cannot call impure function during
   * render". Wrapped, it is a callback, which is allowed to be impure.
   */
  const runAgain = useCallback((h: Horizon = horizon) => {
    setHorizon(h)
    setSeen(false)
    setCeremonyOpen(false)
    setState('sealed')
    setTarget(new Date(Date.now() + h.ms).toISOString())
  }, [horizon])

  const name = (e: string | null) => (e === 'them' ? 'Sarah Chen' : e === 'you' ? 'Priya Nair' : '')
  const person = (e: string | null) => (e === 'them' ? THEM : e === 'you' ? YOU : null)

  return (
    <div className="min-h-screen bg-snow">
      {ceremonyOpen && (
        <DuelRevealCeremony
          matchweek={3}
          opponent={bye ? null : OPPONENT}
          poolId="5eed0004-0000-4000-8000-000000000004"
          duelId="f41d89d1-f24a-4330-9e67-6deb0b01e1bc"
          onClose={() => { setSeen(true); setCeremonyOpen(false) }}
        />
      )}

      {/* ---- the band, exactly as the pool page draws it ---- */}
      <ShowdownBand
        matchweek={3}
        youEntry="you"
        /* ⚠ `!seen` is the whole ask — the same gate as the shipped band. */
        themEntry={state === 'sealed' || bye || !seen ? null : 'them'}
        name={name}
        person={person}
        headline={
          state === 'inplay' ? (
            <>
              <span>400</span>
              <span className="text-white/30 mx-2.5">–</span>
              <span>200</span>
            </>
          ) : state === 'sealed' ? (
            <span className="text-accent-400">
              {/* ⚠ THE HAND-OFF. In the app the clock cannot decide this — the
                  server does, and expiry triggers a jittered router.refresh().
                  There is no server here, so the harness does directly what the
                  refresh would have caused. */}
              <Countdown to={target} onExpire={() => setState('revealed')} />
            </span>
          ) : (
            <button
              onClick={() => setCeremonyOpen(true)}
              className="rounded-chip bg-white/15 hover:bg-white/25 px-5 py-2 text-2xl font-extrabold text-white transition"
            >
              {seen ? 'Replay' : 'Reveal'}
            </button>
          )
        }
        /* ⚠ MIRRORS DuelsTab'S CHOICE, which is the only reason this harness
           is worth looking at. The reveal headline is a BUTTON and sits on the
           V's line between the faces; every other state is a reading and sits
           at the top. Change one and change the other, or this page starts
           showing a layout the pool page does not have. */
        headlineAt={state === 'revealed' ? 'between' : 'top'}
        sub={
          state === 'inplay'
            ? '3 games still to play'
            : state === 'sealed'
              ? 'Until your opponent is revealed'
              : seen
                ? 'Picks are open'
                : null
        }
        liveNow={state === 'inplay'}
        rank={(e) => (e === 'them' ? 1 : 3)}
        points={(e) => (e === 'them' ? 500 : 500)}
      />

      {/* ---- the controls ---- */}
      <div className="max-w-2xl mx-auto p-6 space-y-5">
        <Row label="Band state">
          {(['sealed', 'revealed', 'inplay'] as const).map((s) => (
            <Chip key={s} on={state === s} onClick={() => setState(s)}>
              {s === 'inplay' ? 'in play' : s}
            </Chip>
          ))}
        </Row>

        <Row label="Countdown sits at">
          {HORIZONS.map((h) => (
            <Chip key={h.label} on={horizon.label === h.label} onClick={() => runAgain(h)}>
              {h.label}
            </Chip>
          ))}
        </Row>

        <Row label="The journey">
          <button
            onClick={() => runAgain()}
            className="rounded-chip bg-ink px-3.5 py-2 text-sm font-bold text-white transition hover:opacity-90"
          >
            ▸ Run it from the top
          </button>
          <span className="self-center text-sm text-muted">
            {state === 'sealed'
              ? 'Waiting — watch the clock reach zero.'
              : seen
                ? 'Met them. The button says Replay and the band shows their face.'
                : 'Open — press Reveal. Their spot is still empty.'}
          </span>
        </Row>

        <Row label="Opponent">
          <Chip on={!bye} onClick={() => setBye(false)}>Sarah Chen</Chip>
          <Chip on={bye} onClick={() => setBye(true)}>a bye</Chip>
        </Row>

        <div className="rounded-card border border-border-subtle bg-surface p-4 text-sm text-muted">
          <p className="font-bold text-ink mb-1">The journey, end to end</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Press <b>Run it from the top</b> on the <b>10 seconds</b> horizon.</li>
            <li>The clock counts down. <b>Their half of the band is empty</b> — no face, no name.</li>
            <li>At zero the clock becomes a <b>Reveal</b> button. Their spot is still empty.</li>
            <li>Press it. The walkout plays and ends on their face.</li>
            <li>Close it. <b>Now</b> they appear in the band, and the button says <b>Replay</b>.</li>
          </ol>
          <p className="font-bold text-ink mt-3 mb-1">Also worth checking</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Close the walkout <i>early</i>, at two seconds — you still get their face. Nobody is trapped behind an animation.</li>
            <li>Resize the window: the ceremony is full screen at every size, and the corridor re-fits the aspect.</li>
            <li><b>Make a video</b> hits the real route. It will refuse until MW3 opens (20:59 UTC, 2 Sep) — that is the gate working.</li>
          </ul>
          <p className="mt-3 text-xs">
            ⚠ One thing this page fakes: at zero it flips state directly. The app
            cannot — sealed-vs-open is decided server-side, so the real clock
            fires a jittered <code>router.refresh()</code> and the server hands
            back an open matchweek.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-extrabold tracking-[3px] text-muted mb-2">{label.toUpperCase()}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-chip px-3.5 py-2 text-sm font-bold transition ${
        on ? 'bg-primary-600 text-white' : 'bg-mist text-ink hover:bg-silver'
      }`}
    >
      {children}
    </button>
  )
}

/**
 * ⚠ A LOCAL COPY, and only because `Countdown` is not exported from DuelsTab.
 * The shipped one is the authority; this exists so the harness can show the
 * shape of the sealed state without exporting something for a dev page's sake.
 */
function Countdown({ to, onExpire }: { to: string; onExpire?: () => void }) {
  const [now, setNow] = useState(() => Date.now())
  const expire = useRef(onExpire)
  useEffect(() => { expire.current = onExpire })
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  // ⚠ Fired from an effect, not from the render body — calling a parent's
  // setState while rendering is the "Cannot update a component while rendering
  // a different component" warning, and eslint stops it here anyway.
  const done = new Date(to).getTime() - now <= 0
  useEffect(() => { if (done) expire.current?.() }, [done])
  const left = Math.max(0, new Date(to).getTime() - now)
  const d = Math.floor(left / 86_400_000)
  const h = Math.floor((left % 86_400_000) / 3_600_000)
  const m = Math.floor((left % 3_600_000) / 60_000)
  const sec = Math.floor((left % 60_000) / 1000)
  if (d > 0) return <>{d}d {h}h</>
  if (h > 0) return <>{h}h {m}m</>
  return <>{m}m {String(sec).padStart(2, '0')}s</>
}
