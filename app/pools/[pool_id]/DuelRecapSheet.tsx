'use client'

// =============================================================
// THE DUEL RECAP POPUP — the news, not the story
// =============================================================
// When your duel is decided, the next time you open the pool this slides up,
// says who won, and offers two ways out. It never appears for that duel again.
//
// Plan: drafts/2026-08-31_showdown_duel_recap_plan.md
//
// ## ⚠ THIN ON PURPOSE
//
// This was the whole recap — scoreline, corners, the lot — for about an hour on
// 2026-08-31. Ryan split it: the popup is the news, the PAGE is the story. A
// modal is a bad place to read anything, and there was nowhere to send anybody
// afterwards. So there is nothing here to read: who won, what it paid, and two
// buttons.
//
// ## ⚠ THE RULE THIS LIVES UNDER
//
// **The recap may never be the only way to learn the result.** The duel card,
// the season table and the leaderboard are all correct and visible BEHIND this
// before it opens. Withhold the result until the ceremony is seen and it stops
// being a recap and becomes "we hold your score back so you come back" — the
// disclosure gate's own worked example of a failure.
//
// ## ⚠ SKIP IS AS EASY AS REVIEW
//
// Same size, same weight, side by side — not a grey link under a bright button.
// A member who never wants the ceremony should be able to say so in one tap,
// forever. Making the exit harder than the entrance is the fastest way to teach
// somebody to resent a feature.
//
// Both buttons dismiss. Review navigates as well; it must not come back because
// you read it.
// =============================================================

import Link from 'next/link'

import { Modal } from '@/components/ui/Modal'
import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'
import { duelResult } from '@/lib/league/duelPoints'

export type DuelRecapSide = {
  name: string
  person: AvatarPerson | null
  /** The weekly score the duel was judged on. Shown on the PAGE, not here. */
  score: number
}

export type DuelRecap = {
  /** The entry this belongs to — the row a dismissal stamps. */
  entryId: string
  matchweek: number
  /** ⚠ The instant the "have I seen this" comparison is made against. */
  settledAt: string
  you: DuelRecapSide
  /**
   * ⚠ NULL IS A BYE, and it is the only safe way to detect one. A bye pays
   * `DUEL_BYE`, which IS `DUEL_TIE`, so reading the points would call it a tie.
   */
  them: DuelRecapSide | null
  /** What the engine paid, read from the duel row. Never recomputed here. */
  points: number
}

function Face({ person, dim = false }: { person: AvatarPerson | null; dim?: boolean }) {
  const ring = person ? avatarColor(person.user_id) : 'rgba(255,255,255,0.2)'
  return (
    <span
      className={`w-16 h-16 rounded-full shrink-0 ${dim ? 'opacity-45' : ''}`}
      style={{ boxShadow: `0 0 0 3px color-mix(in srgb, ${ring} 45%, transparent)` }}
    >
      {person
        ? <Avatar person={person} size={64} />
        : <span className="block w-16 h-16 rounded-full bg-white/10" aria-hidden="true" />}
    </span>
  )
}

export function DuelRecapSheet({
  recap, reviewHref, onDismiss,
}: {
  recap: DuelRecap | null
  /** Where Review goes. The caller owns the route shape, not this component. */
  reviewHref: string
  /** Called by BOTH buttons. The caller stamps `last_recap_seen_at`. */
  onDismiss: () => void
}) {
  if (!recap) return null

  // ⚠ Structural, before the points are read — the number cannot tell a bye
  // from a tie.
  const bye = recap.them === null
  const outcome = bye ? 'bye' : duelResult(recap.points) ?? 'lost'

  const headline =
    bye ? 'No opponent this week'
      : outcome === 'won' ? `You beat ${recap.them!.name}`
        : outcome === 'tied' ? `Level with ${recap.them!.name}`
          : `${recap.them!.name} beat you`

  return (
    // ⚠ THE PANEL ITSELF GOES DARK, via `className`, rather than a dark child
    // sitting inside a light sheet. `Modal` renders its own grab-handle row
    // above `children` on mobile, and that row shows the PANEL's background —
    // so a `bg-midnight` child left a light band with a grabber floating above
    // the dark card. Colouring the panel puts the handle on the right ground
    // and lets the panel's own `rounded-t-sheet` + `overflow-hidden` do the
    // corners, which is what they are there for.
    <Modal
      isOpen onClose={onDismiss} size="sm" titleId="duel-recap-title"
      className="bg-midnight dark:border-white/10"
    >
      {/* ⚠ NO `-m-6`. It was there to cancel the Modal's padding, and the Modal
          has NONE — measured, `padding: 0px` on the panel. So the negative
          margin pushed this sheet 24px outside the panel on every side
          (-24…399 inside 0…375) and every bit of padding added here was spent
          covering that overhang. The buttons ended up flush to the left edge
          and flush to the bottom, which is what looked broken.

          Now the sheet fills the panel and `px-6 pt-8 pb-6` is real space. */}
      <div className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(150deg,' +
              ` color-mix(in srgb, ${
                recap.you.person ? avatarColor(recap.you.person.user_id) : 'var(--sp-slate)'
              } 18%, transparent) 0%, transparent 55%)`,
          }}
        />
        <div className="relative px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <p className="t-caption text-white/40 text-center">Matchweek {recap.matchweek}</p>

          {/* ⚠ THE V IS THE SEPARATION. At `gap-3` the two circles touched and
              read as a stack rather than as opponents; the same V the duel card
              uses before a score exists does the job and costs one element. */}
          <div className="flex items-center justify-center gap-5 mt-7">
            <Face person={recap.you.person} dim={outcome === 'lost'} />
            {!bye && (
              <>
                <span className="t-display text-xl text-white/25 select-none">V</span>
                <Face person={recap.them!.person} dim={outcome === 'won'} />
              </>
            )}
          </div>

          <p
            id="duel-recap-title"
            className={`t-display text-2xl sm:text-3xl text-center mt-7 ${
              outcome === 'won' ? 'text-success-400'
                : outcome === 'lost' ? 'text-white/70' : 'text-accent-400'}`}
          >
            {headline}
          </p>

          {/* ⚠ THE NUMBER CARRIES ITS UNIT. "+500" alone is a quantity of
              nothing — and 500 is a new enough figure that nobody yet reads it
              as a duel result on sight. */}
          <p className="t-num t-num-black text-3xl text-white text-center mt-3">
            +{recap.points}
          </p>
          <p className="t-detail text-white/40 uppercase tracking-widest text-center mt-1">
            duel points
          </p>

          {/* ⚠ EQUAL WEIGHT, and a rule to sit under. See the header note: the
              exit may not be harder than the entrance. Same height, same type,
              same width — the only difference is which one is filled. */}
          <div className="grid grid-cols-2 gap-3 mt-8 pt-6 border-t border-white/10">
            <Link
              href={reviewHref}
              onClick={onDismiss}
              className="rounded-pill bg-white text-ink t-caption text-center py-3.5
                         hover:bg-white/90 active:bg-white/80 transition-colors"
            >
              Review
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-pill bg-white/10 text-white t-caption py-3.5
                         hover:bg-white/15 active:bg-white/20 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
