'use client'

// =============================================================
// THE DUEL RECAP — how the last one went, once
// =============================================================
// When your duel is decided, the next time you open the pool this slides up,
// says how it went, and never appears for that duel again.
//
// Plan: drafts/2026-08-31_showdown_duel_recap_plan.md
//
// ## ⚠ THE RULE THIS LIVES UNDER
//
// **The recap may never be the only way to learn the result.** The standings,
// the duel card and the leaderboard are all correct and visible BEHIND this
// sheet before it opens. The moment a result is withheld until the ceremony is
// seen, this stops being a recap and becomes "we hold your score back so you
// come back" — the disclosure gate's own worked example of a failure.
//
// Three things follow, and none of them are optional:
//   1. Dismissing costs nothing — the card's summary carries the same facts.
//   2. Nothing is gated behind it. Not picking, not the table, not banter.
//   3. It fires at most once per settled duel. Reappearing is nagging.
//
// ## Presentational only
//
// No data access, no Supabase client, no derivation of who won. Everything
// arrives resolved in `recap`, and the dismissal is the caller's to handle —
// which is what lets `PoolDetail` decide when the write has succeeded.
// =============================================================

import { Modal } from '@/components/ui/Modal'
import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'
import { duelResult } from '@/lib/league/duelPoints'

export type DuelRecapSide = {
  name: string
  person: AvatarPerson | null
  /** The weekly score the duel was judged on. */
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

function Corner({ side, dim = false }: { side: DuelRecapSide; dim?: boolean }) {
  const ring = side.person ? avatarColor(side.person.user_id) : 'rgba(255,255,255,0.2)'
  return (
    <span className={`flex flex-col items-center gap-2 min-w-0 ${dim ? 'opacity-55' : ''}`}>
      <span
        className="w-14 h-14 rounded-full shrink-0"
        style={{ boxShadow: `0 0 0 3px color-mix(in srgb, ${ring} 45%, transparent)` }}
      >
        {side.person
          ? <Avatar person={side.person} size={56} />
          : <span className="block w-14 h-14 rounded-full bg-white/10" aria-hidden="true" />}
      </span>
      <span className="t-display text-lg text-white truncate max-w-full">{side.name}</span>
    </span>
  )
}

export function DuelRecapSheet({
  recap, onDismiss,
}: {
  recap: DuelRecap | null
  /** Called on close. The caller stamps `last_recap_seen_at`, not this. */
  onDismiss: () => void
}) {
  if (!recap) return null

  // ⚠ THE BYE IS BRANCHED STRUCTURALLY, before the points are read. See the
  // note on `them` above — the number cannot tell a bye from a tie.
  const bye = recap.them === null
  const outcome = bye ? 'bye' : duelResult(recap.points) ?? 'lost'

  const verdict =
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
          <p className="t-caption text-sm text-white/45 text-center mb-6">
            Matchweek {recap.matchweek}
          </p>

          {bye ? (
            <div className="flex flex-col items-center gap-4">
              <Corner side={recap.you} />
              {/* ⚠ The bye sentence is migration 100's, verbatim, and the same
                  one `leagueModeInfo.ts` carries. A fourth way of saying one
                  rule is how the surfaces start disagreeing. */}
              <p className="t-body text-white/70 text-center max-w-xs">
                There was no opponent, so there was no defeat.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-4">
              <Corner side={recap.you} dim={outcome === 'lost'} />
              <span className="flex items-center gap-2 pt-4">
                <span className="t-display text-4xl text-white">{recap.you.score}</span>
                <span className="t-display text-xl text-white/30">&ndash;</span>
                <span className="t-display text-4xl text-white">{recap.them!.score}</span>
              </span>
              <Corner side={recap.them!} dim={outcome === 'won'} />
            </div>
          )}

          <p
            id="duel-recap-title"
            className={`t-display text-2xl text-center mt-7 ${
              outcome === 'won' ? 'text-success-400'
                : outcome === 'lost' ? 'text-white/70' : 'text-accent-400'}`}
          >
            {verdict}
          </p>
          <p className="t-num t-num-black text-3xl text-white text-center mt-2">
            +{recap.points}
          </p>
          <p className="t-detail text-white/40 uppercase tracking-widest text-center mt-1">
            duel points
          </p>

          <button
            type="button"
            onClick={onDismiss}
            className="mt-7 w-full rounded-pill bg-white/10 hover:bg-white/15 active:bg-white/20
                       text-white t-caption py-3 transition-colors"
          >
            {/* Not "Continue" or "Got it": it says what dismissing does, and
                dismissing is genuinely all it does. */}
            Close
          </button>
        </div>
      </div>
    </Modal>
  )
}
