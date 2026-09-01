'use client'

// =============================================================
// THE WALKOUT, IN THE APP — press Reveal, and they come out of the tunnel
// =============================================================
// The interactive twin of remotion/DuelReveal.tsx. Same corridor, same
// silhouette holding back their colour, same lower third — but here you pull
// them out yourself instead of watching it happen.
//
// ## ⚠ ONE PRESS, THEN IT PLAYS ITSELF
//
// This was three taps for about an hour — the Duolingo chest. Ryan's call,
// 2026-09-01: the tapping was a gimmick. Making somebody work a handle three
// times does not build anticipation, it builds impatience, and the second tap
// has no meaning the first did not already have.
//
// What is left is one press, and the press is the honest part of the idea: the
// member chooses to watch. Everything after it is a fixed 2.6s walkout.
//
// ⚠ IT STILL GATES NOTHING. Run the disclosure gate's tooltip test:
// *"We make you tap three times before telling you who you are playing"* fails.
// *"Press Reveal to watch them walk out"* passes. The duel card underneath
// already names them, `Skip` is one press away throughout, and this can be
// replayed or never opened at all. Nothing here is randomised either — the
// round-robin fixed the opponent long before anybody pressed anything — so
// gate 5 is untouched.
//
// ## ⚠ WHEN THIS IS PORTED TO REACT NATIVE: HAPTICS, NOT SOUND
//
// Ryan's call, 2026-09-01. The Remotion twin briefly had a whoosh per gate and
// a shutter on the doors; both were cut, because a share video that makes noise
// when it autoplays is one people scroll past, and a web page that makes noise
// when you tap it is one people stop tapping.
//
// A phone can do the same job silently. `expo-haptics` is ALREADY a dependency
// (`~15.0.8`) and already used in this codebase — see
// mobile/components/haptic-tab.tsx and mobile/app/pool/[id]/banter.tsx:1024 for
// the established call shape:
//
//     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
//
// The intended mapping, one beat to one tap:
//
//     each clue arriving   → ImpactFeedbackStyle.Light
//     the blowout          → ImpactFeedbackStyle.Heavy
//     the name landing     → ImpactFeedbackStyle.Medium
//
// ⚠ FIRE THEM OFF THE SAME CONSTANTS THE VISUALS USE (`LEAD_MS`, `CLUE_MS`), not
// off a second set of timers. Two clocks for one ceremony drift, and a buzz that
// lands a beat after the thing it is describing is worse than no buzz.
//
// ⚠ Nothing to port INTO yet: Showdown has no surfaces in `mobile/` at all
// today, which is the same gap `t-display` in globals.css records for the
// display treatment.
//
// ## ⚠ CSS TRANSITIONS ARE FINE HERE — AND ONLY HERE
//
// The Remotion twin may not use them: `transition` and `animation` do not render
// in a frame-by-frame capture, which is the first rule in Remotion's own markup
// guidance. This is a live DOM, so transitions are the right tool. The two
// files therefore animate by different mechanisms ON PURPOSE, and neither can
// be copied into the other.
// =============================================================

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'

/**
 * ⚠ LAZY, AND `ssr: false`. `three` is ~600KB gzipped and this ceremony is
 * opened at most once a week, by members who choose to. Importing it directly
 * would put the whole of Three.js in the pool-detail bundle for everybody who
 * never presses Reveal. `ssr: false` because WebGL means nothing on the server.
 *
 * The fallback is deliberately nothing: the corridor is scenery, and a spinner
 * where the tunnel should be is worse than a beat of darkness.
 */
const DuelRevealCorridor = dynamic(() => import('./DuelRevealCorridor'), {
  ssr: false,
  loading: () => null,
})

export type RevealOpponent = {
  name: string
  person: AvatarPerson
  /** Their season so far — what "what am I up against" actually means. */
  record: { won: number; tied: number; lost: number }
  duelPoints: number
  rank: number | null
}

/**
 * The walk, in three clues.
 *
 * ⚠ THIS IS THE EA WALKOUT'S STRUCTURE, and it is the reason the corridor is
 * worth walking down at all. There, a player is revealed by nationality, then
 * position, then club — three facts, each narrowing it, and by the third you
 * have usually guessed. The pleasure is the deduction, not the surprise.
 *
 * Ours are the three the pool can actually reason about: their record, what it
 * has paid them, and where that puts them. Broad to narrow, same as EA's.
 *
 * ⚠ EVERY CLUE IS ALREADY ON THE LEADERBOARD. Nothing here is withheld
 * information dressed as a game — run the disclosure gate's tooltip test: "we
 * show you three public facts about your opponent before naming them" passes.
 * In a ten-person pool the third clue usually gives it away, and that is the
 * design working, not a leak.
 */
const LEAD_MS = 1000
/**
 * ⚠ 1200ms WAS NOT LONG ENOUGH TO READ. Ryan, 2026-09-01: *"give it enough
 * time for the user to read them"*. A clue has to be found on screen, parsed
 * and then thought about — "1W 0T 0L" only means something once you have
 * compared it to your own — and 1.2s covered the first of those three.
 */
const CLUE_MS = 1900
const CLUES = 3
/** 1000 + 3×1900 = 6.7s. Longer than it was; Skip is always there for anyone who disagrees. */
const WALK_MS = LEAD_MS + CLUES * CLUE_MS

/**
 * ⚠ MEASURED, NOT GUESSED. Centring the figure on the vanishing point removed
 * the offset that used to hold it clear of the bottom-anchored name plate, so
 * on a short window — a laptop at 700px, or this app's own browser pane — a
 * fixed 280px disc and the plate ran into each other. The disc is capped
 * against the real viewport height instead of being nudged off centre again.
 */
function subscribeViewport(onChange: () => void) {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}

export function DuelRevealCeremony({
  matchweek,
  opponent,
  onClose,
}: {
  matchweek: number
  /** ⚠ NULL IS A BYE — structural everywhere in Showdown, including here. */
  opponent: RevealOpponent | null
  /**
   * ⚠ REQUIRED BUT UNREAD, ON PURPOSE. These addressed the shareable render,
   * whose button Ryan removed on 2026-09-01. Both call sites still pass them
   * and the render routes still work, so restoring the share is a hook call and
   * a button here — not a prop-drilling exercise through DuelsTab and the dev
   * harness. Delete them only if the video is being abandoned outright.
   */
  poolId: string
  duelId: string
  onClose: () => void
}) {
  // ⚠ 900 IS THE SERVER SNAPSHOT, not a real measurement — there is no window
  // to measure during SSR. It only has to be a sane portrait height; the first
  // client render replaces it.
  const vh = useSyncExternalStore(subscribeViewport, () => window.innerHeight, () => 900)
  /** Big enough to be the subject, small enough to clear the plate below it. */
  const discMax = Math.max(160, Math.min(280, vh * 0.32))

  // 0 = walking in, 1..3 = a clue is up, 4 = revealed.
  const [clue, setClue] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [flash, setFlash] = useState(false)
  const [started, setStarted] = useState(false)

  /**
   * ⚠ THE FIRST PAINT HAS TO HAPPEN AT THE START VALUE. A CSS transition only
   * runs if the browser saw the element small before it was told to be big;
   * flipping in the same tick as mount collapses both into one style resolution
   * and the figure snaps to full size instead of walking.
   *
   * Two frames, because one is not enough: the first schedules the paint, the
   * second runs after it. A `setTimeout` guess would race a slow first paint on
   * a cold device.
   *
   * ⚠ DO NOT "FIX" THIS BY WATCHING IT IN A BACKGROUND TAB. A hidden document
   * does not paint, so CSS transitions never advance while `setTimeout` keeps
   * firing — which looks exactly like this effect being broken: the inline width
   * reads 280px while the computed width sits frozen at 130px. It cost a
   * diagnosis here. Check `document.visibilityState` before believing it.
   */
  useEffect(() => {
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setStarted(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [])

  const finish = useCallback(() => {
    setRevealed(true)
    setFlash(true)
    window.setTimeout(() => setFlash(false), 40)
  }, [])

  // The clues arrive on a fixed cadence, then the walk lands on its own.
  useEffect(() => {
    const ids = [
      ...Array.from({ length: CLUES }, (_, i) =>
        window.setTimeout(() => setClue(i + 1), LEAD_MS + i * CLUE_MS),
      ),
      window.setTimeout(finish, WALK_MS),
    ]
    return () => ids.forEach(clearTimeout)
  }, [finish])

  const skip = useCallback(() => {
    setClue(CLUES)
    finish()
  }, [finish])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (revealed) onClose()
        else skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [revealed, skip, onClose])

  // 0 while the figure is still down the corridor, 1 once it has arrived.
  // The figure steps closer with each clue rather than making one jump, so the
  // corridor and the clues advance together.
  const t = revealed ? 1 : started ? clue / CLUES : 0
  /** The figure's diameter right now, growing as they walk out. */
  const disc = 130 + t * (discMax - 130)

  /**
   * The three clues, broad to narrow — EA's nationality → position → club.
   *
   * ⚠ ORDER IS THE DESIGN. Rank last, because in a small pool it is effectively
   * the answer; leading with it would end the guess before it started.
   */
  const clues = opponent
    ? [
        { label: 'THEIR RECORD', value: `${opponent.record.won}W ${opponent.record.tied}T ${opponent.record.lost}L` },
        { label: 'DUEL POINTS', value: String(opponent.duelPoints) },
        { label: 'POOL RANK', value: opponent.rank === null ? 'unranked' : `#${opponent.rank}` },
      ]
    : []

  const accent = opponent ? avatarColor(opponent.person.user_id) : 'rgba(255,255,255,0.3)'
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Matchweek ${matchweek} opponent reveal`}
      className="fixed inset-0 z-50 overflow-hidden select-none flex items-center justify-center"
      style={{ backgroundColor: '#04060A' }}
      onClick={revealed ? onClose : skip}
    >
      {/* ⚠ FULL SCREEN ON EVERY SIZE. This was letterboxed to a 9:16 panel on
          desktop to match the shareable video; Ryan's call, 2026-09-01, is that
          a reveal should take the whole window. A centred portrait card reads
          as a preview of something rather than the thing itself.
          
          ⚠ THE CORRIDOR FILLS, THE TYPE DOES NOT. The 3D adapts to any aspect
          on its own, but a lower third left to run the width of a monitor puts
          the name a foot from the stats. Text is capped below. */}
      <div className="relative w-full h-full" style={{ backgroundColor: '#04060A' }}>
      {/* ---- the corridor ----
          ⚠ Real 3D now, lazily loaded. The CSS version this replaced could not
          work: scaled rectangles only grow, so nothing was ever further away —
          and its depth modulo was driven by a transition, which interpolated
          THROUGH the wrap and sent half the rings backwards. */}
      <DuelRevealCorridor
        accent={revealed ? accent : null}
        /* Cruises while the clues arrive, then settles once they have landed. */
        speed={revealed ? 1.4 : 3.2 + clue * 1.6}
      />

      {/* The light at the far end, dying back as they arrive. */}
      <div
        className="absolute inset-0 transition-[opacity,background] duration-[1200ms] ease-out"
        style={{
          /* ⚠ `50% 50%`, NOT `50% 44%`. This is the light at the end of the
             tunnel, so it has to sit ON the vanishing point — at 44% it was a
             third centre, disagreeing with both the rings and the figure. */
          background: `radial-gradient(34% 20% at 50% 50%, rgba(255,255,255,${0.5 - t * 0.32}), transparent 70%)`,
        }}
      />

      {/* ---- who is coming ----
          ⚠ DEAD CENTRE, BECAUSE THAT IS WHERE THE TUNNEL CONVERGES. This block
          used to carry `-translate-y-[9%]` to keep the growing disc off the
          bottom-anchored name plate. It bought that clearance by putting the
          figure 9% of the viewport ABOVE the vanishing point the corridor
          converges on — so the rings closed on one spot and the person arrived
          at another. Ryan: *"the player's avatar is not lined up with the moving
          rings"*, and *"the ring getting bigger for the reveal should be
          centered with the tunnel rings"*. Both are this.
          
          The corridor canvas is `inset-0`, its camera is on the world axis, so
          its vanishing point is the exact centre of this box. Everything that
          is meant to arrive out of the tunnel is now centred here and nowhere
          else. The clearance the offset used to buy is bought below instead,
          by capping the disc against viewport height. */}
      <div className="absolute inset-0 flex items-center justify-center">
        {opponent ? (
          <div
            className="rounded-full flex items-center justify-center transition-all duration-[1200ms] ease-out"
            style={{
              // Grows as they walk toward you.
              width: disc,
              height: disc,
              // ⚠ NEUTRAL UNTIL THE FLASH. Before the reveal this is a plain
              // grey disc: no gradient, no rim in their colour. A member's
              // colour IS their identity everywhere else in the product, so a
              // tinted halo names them before the plate does.
              backgroundColor: revealed ? 'transparent' : 'rgba(255,255,255,0.05)',
              boxShadow: revealed
                ? `0 0 0 10px color-mix(in srgb, ${accent} 55%, transparent), 0 0 110px color-mix(in srgb, ${accent} 45%, transparent)`
                : `0 0 0 ${3 + t * 5}px rgba(255,255,255,${0.10 + t * 0.10})`,
            }}
          >
            {/* ⚠ THE AVATAR IS NOT RENDERED UNTIL THE REVEAL, rather than
                rendered and dimmed. Darkening it with a `filter` left the
                initials legible — Ryan caught "SC" readable through the whole
                walkout — and anything merely dimmed is also still sitting in the
                DOM for anyone who looks. Sealed has to mean absent.

                The swap is instantaneous and that is fine: the flash covers it,
                which is the frame it was put there for. */}
            {revealed && <Avatar person={opponent.person} size={disc} />}
          </div>
        ) : (
          <div
            className="rounded-full border-[6px] border-dashed border-white/15 transition-all duration-[1200ms] ease-out"
            style={{ width: disc, height: disc }}
          />
        )}
      </div>

      {/* One white pulse on the last pull — the flashbulbs, once. */}
      {revealed && (
        <div
          className="absolute inset-0 bg-white pointer-events-none"
          style={{
            opacity: flash ? 0.85 : 0,
            transition: flash ? 'none' : 'opacity 700ms ease-out',
          }}
        />
      )}

      {/* ---- the clues: FRONT AND CENTRE ----
          ⚠ THEY USED TO BE IN THE LOWER THIRD, and Ryan's note was *"in the
          build up the players stats should be front and center and easy to
          read"*. Down there they were the smallest thing on screen, below the
          fold on a short window, and competing with the corridor's brightest
          rings for attention. The buildup has no name plate to share the frame
          with — nothing has been named yet — so the middle was free the whole
          time.
          ⚠ It sits on the SAME centre as the figure and the rings, so the clue
          arrives out of the tunnel rather than beside it. */}
      {!revealed && (
        <div className="absolute inset-0 flex items-center justify-center px-8 pointer-events-none">
          {/* ⚠ A SCRIM. The type sits over the brightest thing in the shot —
              the gate rings are hard white — and white-on-white made the labels
              vanish: legible in isolation, unreadable in place. */}
          <div
            className="absolute inset-0"
            style={{ background: 'radial-gradient(closest-side, rgba(4,6,10,0.84), transparent 74%)' }}
          />
          <div className="relative text-center">
            {clue === 0 || !opponent ? (
              <p className="text-white/45 font-bold text-lg">
                {opponent ? 'Someone is coming…' : 'Checking the tunnel…'}
              </p>
            ) : (
              /* ⚠ KEYED ON THE CLUE so React remounts it — the fade has to
                 restart for each one. Reusing the node just swaps the text and
                 the third clue arrives with no animation at all. */
              <div key={clue} className="animate-fade-up">
                {/* ⚠ IT SAYS WHOSE FACTS THESE ARE. "1W 0T 0L" with no subject
                    is a number flying at you, and at this point in the walk
                    nobody has been named — so the card has to carry it. */}
                <p className="text-[11px] font-extrabold tracking-[5px] text-white/40">
                  YOUR NEXT OPPONENT
                </p>
                <p className="mt-7 text-[11px] font-extrabold tracking-[5px] text-white/55">
                  {clues[clue - 1].label}
                </p>
                <p className="t-display text-6xl sm:text-7xl text-white mt-3">
                  {clues[clue - 1].value}
                </p>
              </div>
            )}

            {/* How many clues are left. Not a loading bar — a countdown of
                hints, which is the thing the member is actually tracking. */}
            <div className="mt-9 flex items-center justify-center gap-2.5" aria-hidden>
              {Array.from({ length: CLUES }).map((_, i) => (
                <span
                  key={i}
                  className="h-2 rounded-pill transition-all duration-300"
                  style={{
                    width: i < clue ? 30 : 8,
                    backgroundColor: i < clue ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.2)',
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- the name plate, only once they have arrived ---- */}
      {revealed && (
        <div className="absolute inset-x-0 bottom-0 p-8 pb-14 sm:pb-20">
          {/* ⚠ A SCRIM UNDER THE PLATE. The figure is centred now rather than
              lifted, so on a short window its lower edge comes close to this
              block — a gradient means "close" reads as depth instead of a
              collision. */}
          <div
            className="absolute inset-x-0 bottom-0 h-[70%] pointer-events-none"
            style={{ background: 'linear-gradient(to top, #04060A 12%, rgba(4,6,10,0.72) 55%, transparent)' }}
          />
          <div className="relative max-w-xl mx-auto">
            <div className="h-2 rounded-pill mb-5" style={{ backgroundColor: accent }} />
            <p className="t-display text-4xl sm:text-5xl text-white">
              {opponent ? opponent.name : 'No opponent this week'}
            </p>
            {opponent && (
              <p className="mt-3 flex items-baseline gap-5 text-white/60">
                <span className="text-lg font-extrabold">
                  {opponent.record.won}W {opponent.record.tied}T {opponent.record.lost}L
                </span>
                <span className="t-display text-2xl" style={{ color: accent }}>
                  {opponent.duelPoints}
                </span>
                <span className="text-sm font-semibold text-white/40">
                  {opponent.rank === null ? 'unranked' : `#${opponent.rank} in the pool`}
                </span>
              </p>
            )}
            {/* ⚠ THE "MAKE A VIDEO" BUTTON WAS HERE AND RYAN REMOVED IT
                (2026-09-01: *"there is no need for a make a video button"*).
                ⚠ THAT LEAVES THE RENDER PIPELINE WITH NO CALLER AGAIN — the
                routes, `useDuelVideo` and the Remotion compositions are all
                still on disk and still work, but nothing in the product reaches
                them. `poolId` and `duelId` are deliberately kept on the props
                type, and both call sites still pass them, so putting the share
                back is a button and a hook call rather than a re-wiring. */}
            <button
              onClick={(e) => { e.stopPropagation(); onClose() }}
              className="mt-7 w-full rounded-chip bg-white/10 hover:bg-white/15 text-white font-bold py-3.5"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ---- ⚠ SKIP: same weight, present from the first frame ---- */}
      {!revealed && (
        <button
          onClick={(e) => { e.stopPropagation(); skip() }}
          className="absolute top-6 right-6 rounded-chip px-4 py-2 text-sm font-bold text-white/70 hover:text-white bg-white/10"
        >
          Skip
        </button>
      )}

      <p className="absolute top-8 left-8 text-xs font-extrabold tracking-[4px] text-white/35">
        MATCHWEEK {matchweek}
      </p>
      </div>
    </div>
  )
}

