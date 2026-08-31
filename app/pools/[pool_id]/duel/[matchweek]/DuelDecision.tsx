'use client'

// =============================================================
// THE DECISION — one settled duel, told properly
// =============================================================
// The Fight Night "06 Decision" card. Plan:
// drafts/2026-08-31_showdown_duel_recap_plan.md
//
// ## ⚠ THIS HAS TO BE WORTH OPENING WHEN YOU LOST
//
// The mockup is the winner's view. If only wins get a well-made card, half the
// pool learns that Skip is the right button — quietly, and nobody would ever
// report it. That is the SYMMETRY gate failing, and it is the one this design
// can actually fail.
//
// So a loss gets the same structure, the same decisive-fixture line, the same
// record. What it does NOT get is consolation. Stating a defeat plainly is
// respect; dressing it up is what produces the bad feeling the product exists
// to avoid. There is no "unlucky!", no "so close!", no softening adverb.
//
// ## ⚠ "WHAT IT MOVED" MUST BE WILLING TO SAY NOTHING MOVED
//
// Win and stay 4th and it says 4th. A block that only ever reports good news is
// not a record, it is a slot machine.
// =============================================================

import Link from 'next/link'

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'
import type { DuelScoreline, DuelVerdict } from '@/lib/league/duelVerdict'

type Side = { name: string; person: AvatarPerson | null }

function Corner({ side, dim, align }: { side: Side; dim: boolean; align: 'left' | 'right' }) {
  const ring = side.person ? avatarColor(side.person.user_id) : 'rgba(255,255,255,0.2)'
  return (
    <span className={`flex flex-col gap-2 min-w-0 ${align === 'right' ? 'items-end' : 'items-start'} ${
      dim ? 'opacity-55' : ''}`}>
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

function MovedRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-t border-white/10">
      <span className="t-body text-white/70">{label}</span>
      <span className="t-num t-num-extrabold text-white text-right">{children}</span>
    </div>
  )
}

export function DuelDecision({
  poolId, poolName, matchweek, verdict, scoreline, decisiveFixture, you, them, record,
}: {
  poolId: string
  poolName: string
  matchweek: number
  verdict: DuelVerdict
  scoreline: DuelScoreline
  /** "Liverpool v Man Utd", or null when no single fixture decided it. */
  decisiveFixture: string | null
  you: Side
  them: Side | null
  record: { won: number; drawn: number; lost: number } | null
}) {
  const bye = verdict.outcome === 'bye'
  const eyebrow =
    bye ? 'No opponent this week'
      : verdict.outcome === 'won' ? `You beat ${them!.name}`
        : verdict.outcome === 'tied' ? `Level with ${them!.name}`
          : `${them!.name} beat you`

  const youColour = you.person ? avatarColor(you.person.user_id) : 'rgba(255,255,255,0.5)'
  const themColour = them?.person ? avatarColor(them.person.user_id) : 'rgba(255,255,255,0.5)'

  // The history line. ⚠ `record` counts THIS duel too, so a first meeting is
  // a total of one — not zero.
  const meetings = record ? record.won + record.drawn + record.lost : 0
  const history =
    !record || !them ? null
      : meetings <= 1 ? `Your first meeting with ${them.name}.`
        : verdict.outcome === 'won' && record.won === 1
          ? `First time you have ever beaten ${them.name}.`
          : `You have met ${meetings} times: ${record.won}–${record.drawn}–${record.lost}.`

  return (
    <main className="min-h-screen bg-snow dark:bg-midnight px-4 py-6 sm:py-10">
      <div className="max-w-lg mx-auto flex flex-col gap-4">
        <Link href={`/pools/${poolId}`} className="t-caption text-muted hover:text-ink transition-colors">
          &larr; {poolName}
        </Link>

        {/* THE DECISION */}
        <div className="rounded-card overflow-hidden bg-midnight relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(150deg,' +
                ` color-mix(in srgb, ${youColour} 20%, transparent) 0%,` +
                ` transparent 50%, color-mix(in srgb, ${themColour} 18%, transparent) 100%)`,
            }}
          />
          <div className="relative px-5 sm:px-8 py-7">
            <p className="t-caption text-white/45 text-center">{eyebrow}</p>

            {/* ⚠ The verdict term, never chosen for drama — see duelVerdict.ts. */}
            <p className="t-display text-4xl sm:text-5xl text-accent-400 text-center mt-2">
              {verdict.term}
            </p>

            {bye ? (
              <p className="t-body text-white/70 text-center mt-6 max-w-xs mx-auto">
                There was no opponent, so there was no defeat.
              </p>
            ) : (
              <>
                {/* ⭐ FIXTURES, not points — Ryan's call. A pick count is a
                    number a member actually experienced, and unlike raw points
                    it means the same thing at both scoring depths. The points
                    sit underneath as the audit trail. */}
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 mt-6">
                  <span className="t-display text-5xl sm:text-6xl text-right"
                        style={{ color: youColour }}>{scoreline.yourFixtures}</span>
                  <span className="t-display text-2xl text-white/25">&ndash;</span>
                  <span className="t-display text-5xl sm:text-6xl"
                        style={{ color: themColour }}>{scoreline.theirFixtures}</span>
                </div>
                <p className="t-num t-num-medium text-xs text-white/40 text-center mt-2">
                  fixtures won &middot; {scoreline.yourPoints}&ndash;{scoreline.theirPoints} points
                </p>

                {/* ⚠ THE DISAGREEMENT IS NAMED, not hidden. At Scores depth you
                    can take more fixtures and still lose on points, and a 6-4
                    sitting above "Sarah beat you" would look broken unless the
                    card says what happened. */}
                {verdict.scorelineDisagrees && (
                  <p className="t-body text-white/70 text-center mt-4">
                    You took more of the games. {them!.name} took more of the points &mdash; and the
                    duel is decided on points.
                  </p>
                )}

                <div className="grid grid-cols-2 gap-6 mt-7">
                  <Corner side={you} dim={verdict.outcome === 'lost'} align="left" />
                  <Corner side={them!} dim={verdict.outcome === 'won'} align="right" />
                </div>

                {decisiveFixture && (
                  <p className="t-body text-white/70 text-center mt-7 pt-5 border-t border-white/10">
                    It came down to <span className="font-bold text-white">{decisiveFixture}</span>.
                  </p>
                )}
                {/* ⚠ No decisive fixture is a REAL answer, not a gap. A duel won
                    by three games was not decided by one of them, and naming
                    one anyway would be a story we made up. */}
                {!decisiveFixture && verdict.outcome !== 'tied' && (
                  <p className="t-body text-white/50 text-center mt-7 pt-5 border-t border-white/10">
                    No single fixture decided this one.
                  </p>
                )}
                {history && (
                  <p className="t-body text-white/70 text-center mt-2">{history}</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* WHAT IT MOVED */}
        <div className="rounded-card overflow-hidden bg-midnight px-5 sm:px-8 py-5">
          <p className="t-caption text-white/45">What it moved</p>
          <MovedRow label="Duel points">
            <span className={verdict.outcome === 'lost' ? 'text-white/50' : 'text-success-400'}>
              {verdict.outcome === 'lost' ? '+0' : `+${verdict.outcome === 'won' ? 500 : 250}`}
            </span>
          </MovedRow>
          {record && them && (
            <MovedRow label={`Record v ${them.name}`}>
              {record.won}&ndash;{record.drawn}&ndash;{record.lost}
            </MovedRow>
          )}
          <MovedRow label={`Matchweek ${matchweek + 1}`}>
            <span className="t-caption text-white/45 border border-white/20 rounded-pill px-2.5 py-1">
              Sealed
            </span>
          </MovedRow>
        </div>

        <Link
          href={`/pools/${poolId}`}
          className="rounded-pill bg-white/10 dark:bg-white/10 text-ink dark:text-white
                     t-caption text-center py-3.5 hover:bg-white/15 transition-colors
                     border border-border-default"
        >
          Back to the pool
        </Link>
      </div>
    </main>
  )
}
