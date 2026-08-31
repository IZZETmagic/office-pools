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
      className={`w-11 h-11 rounded-full shrink-0 ${dim ? 'opacity-50' : ''}`}
      style={{ boxShadow: `0 0 0 2px color-mix(in srgb, ${ring} 45%, transparent)` }}
    >
      {person
        ? <Avatar person={person} size={44} />
        : <span className="block w-11 h-11 rounded-full bg-white/10" aria-hidden="true" />}
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
    <Modal isOpen onClose={onDismiss} size="sm" titleId="duel-recap-title">
      <div className="bg-midnight -m-6 p-6 rounded-card relative overflow-hidden">
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
        <div className="relative">
          <p className="t-caption text-white/45 text-center">Matchweek {recap.matchweek}</p>

          <div className="flex items-center justify-center gap-3 mt-5">
            <Face person={recap.you.person} dim={outcome === 'lost'} />
            {!bye && <Face person={recap.them!.person} dim={outcome === 'won'} />}
          </div>

          <p
            id="duel-recap-title"
            className={`t-display text-2xl text-center mt-5 ${
              outcome === 'won' ? 'text-success-400'
                : outcome === 'lost' ? 'text-white/70' : 'text-accent-400'}`}
          >
            {headline}
          </p>
          <p className="t-num t-num-black text-2xl text-white text-center mt-1.5">
            +{recap.points}
          </p>

          {/* ⚠ EQUAL WEIGHT. See the header note — the exit may not be harder
              than the entrance. Same height, same type, side by side. */}
          <div className="grid grid-cols-2 gap-3 mt-7">
            <Link
              href={reviewHref}
              onClick={onDismiss}
              className="rounded-pill bg-white text-ink t-caption text-center py-3
                         hover:bg-white/90 active:bg-white/80 transition-colors"
            >
              Review summary
            </Link>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-pill bg-white/10 text-white t-caption py-3
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
