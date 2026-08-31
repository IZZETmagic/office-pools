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

import { useState } from 'react'
import Link from 'next/link'

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { avatarColor } from '@/lib/design/avatarGradient'
import type { DuelScoreline, DuelVerdict } from '@/lib/league/duelVerdict'

type Side = { name: string; person: AvatarPerson | null }

/**
 * "Monday" — or a date once it is old enough for a weekday to be ambiguous.
 *
 * ⚠ Formatted in the CLIENT, deliberately. This component is `'use client'`, so
 * `toLocaleDateString` runs in the reader's timezone. Formatting it on the
 * server would stamp UTC and tell somebody in Bermuda that a Sunday-night
 * message was posted on Monday — the frozen-UTC bug `LocalTime` exists to fix.
 */
function dayOf(iso: string): string {
  const d = new Date(iso)
  const days = (Date.now() - d.getTime()) / 86_400_000
  return days <= 6
    ? d.toLocaleDateString(undefined, { weekday: 'long' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

/** 1st, 2nd, 3rd, 4th… including the 11th/12th/13th exceptions. */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/**
 * Share the result.
 *
 * ⚠ IT SHARES A LINK, NOT AN IMAGE, AND THAT IS WHY IT IS SAFE TODAY. The page
 * behind this URL is membership-gated — a non-member gets a 404 — so the banter
 * quote cannot leave the pool by this route no matter who the link is sent to.
 *
 * ⚠ THAT PROTECTION DISAPPEARS THE DAY AN OG IMAGE EXISTS. An `opengraph-image`
 * renders the card into a picture that unfurls in any chat app, to anybody, with
 * no membership check at all. Ryan's rule (2026-08-31) applies there: the quote
 * does NOT go in it. Whoever builds that is reading this comment, not the plan
 * doc.
 *
 * `navigator.share` where it exists — a phone's own sheet is better than
 * anything here — and a clipboard copy everywhere else.
 */
function ShareButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const absolute = typeof window === 'undefined' ? url : new URL(url, window.location.origin).toString()
    if (navigator.share) {
      // A cancelled share rejects. That is the member changing their mind, not
      // a failure, so it must not surface as one.
      try { await navigator.share({ url: absolute }); return } catch { return }
    }
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // No clipboard permission and no share sheet. Say nothing rather than
      // claiming a copy that did not happen.
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="rounded-pill bg-accent-400 text-neutral-900 t-caption py-3.5
                 hover:bg-accent-300 active:bg-accent-500 transition-colors"
    >
      {copied ? 'Link copied' : 'Share the result'}
    </button>
  )
}

/**
 * Just the circle. The NAME is rendered on its own row below the scoreline —
 * see the layout note where it is used — so this no longer carries one.
 */
function Face({ side, dim }: { side: Side; dim: boolean }) {
  const ring = side.person ? avatarColor(side.person.user_id) : 'rgba(255,255,255,0.2)'
  return (
    <span
      className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full shrink-0 ${dim ? 'opacity-55' : ''}`}
      style={{ boxShadow: `0 0 0 3px color-mix(in srgb, ${ring} 45%, transparent)` }}
    >
      {side.person
        ? <Avatar person={side.person} size={64} />
        : <span className="block w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/10" aria-hidden="true" />}
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
  poolId, poolName, matchweek, verdict, scoreline, decisiveFixture, you, them, record, quote,
  position, shareUrl,
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
  /**
   * The opponent's last typed word before kickoff, when there was one.
   *
   * ⚠ OMIT THIS FROM ANYTHING SHARED — Ryan, 2026-08-31. Quoting somebody
   * inside the pool they posted in is the joke working. Putting their words on
   * a card that leaves the pool republishes them somewhere they did not post,
   * they cannot consent at the moment it happens, and they are not the one
   * pressing the button. When the share image lands (`next/og`, v2), this block
   * does not go in it.
   */
  quote: { content: string; author: string; at: string } | null
  /**
   * Position in the pool table, after and before this matchweek settled.
   *
   * ⚠ Both may be null — a pool that has never settled a matchweek has no
   * previous rank, and the row shows the current position with no arrow rather
   * than inventing a move.
   */
  position: { now: number | null; before: number | null }
  /** Path to this page. See the share note on the button. */
  shareUrl: string
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
            {/* ⚠ THE NEWS IS THE HEADLINE, THE VERDICT IS THE FLAVOUR. Until
                2026-08-31 this was the other way round — "DECISION" in 48px
                gold above "you beat sarah c" in 11px grey — so the biggest
                thing on the card was a word we chose and the smallest was what
                actually happened. Ryan's call, and he is right: the term is
                colour, the result is the point. */}
            <p className="t-caption text-white/40 text-center">Result</p>
            <p className="t-display text-3xl sm:text-4xl text-white text-center mt-1.5">
              {eyebrow}
            </p>
            <p className="t-caption text-accent-400 text-center mt-2">{verdict.term}</p>

            {bye ? (
              <p className="t-body text-white/70 text-center mt-6 max-w-xs mx-auto">
                There was no opponent, so there was no defeat.
              </p>
            ) : (
              <>
                {/* ⭐ FIXTURES, not points — Ryan's call. A pick count is a
                    number a member actually experienced, and unlike raw points
                    it means the same thing at both scoring depths. The points
                    sit underneath as the audit trail.

                    ⚠ FACES IN LINE WITH THE SCORES, NAMES ON THEIR OWN ROW —
                    the same fix the duel card's hero needed, for the same
                    reason. The faces sat in a separate block below, so the
                    scoreline was two numbers belonging to nobody and you read
                    the card twice: once for the score, once for whose it was.
                    Sharing a row with a 60px numeral is what forces the name
                    onto its own line, not a preference — "IZZETmagic" has half
                    the card that way instead of a quarter, and truncates at
                    neither size. */}
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-4 mt-6">
                  <Face side={you} dim={verdict.outcome === 'lost'} />
                  <span className="flex items-center justify-center gap-2 sm:gap-3">
                    <span className="t-display text-5xl sm:text-6xl"
                          style={{ color: youColour }}>{scoreline.yourFixtures}</span>
                    <span className="t-display text-2xl text-white/25">&ndash;</span>
                    <span className="t-display text-5xl sm:text-6xl"
                          style={{ color: themColour }}>{scoreline.theirFixtures}</span>
                  </span>
                  <Face side={them!} dim={verdict.outcome === 'won'} />
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <p className={`t-display text-lg sm:text-xl text-white truncate ${
                    verdict.outcome === 'lost' ? 'opacity-55' : ''}`}>{you.name}</p>
                  <p className={`t-display text-lg sm:text-xl text-white truncate text-right ${
                    verdict.outcome === 'won' ? 'opacity-55' : ''}`}>{them!.name}</p>
                </div>

                <p className="t-num t-num-medium text-xs text-white/40 text-center mt-4">
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

                {/* ⚠ THEIR WORDS, UNEDITED. The server drops anything over 140
                    characters rather than truncating it — half a sentence read
                    back is a misquote with our name on it. And this block is
                    the one thing that must NOT go into the share image. */}
                {quote && (
                  <figure className="mt-6 pl-4 border-l-2 border-danger-400/70 text-left">
                    <blockquote className="t-body text-white/85 italic">
                      &ldquo;{quote.content}&rdquo;
                    </blockquote>
                    <figcaption className="t-detail text-white/40 mt-1.5">
                      &mdash; {quote.author}, {dayOf(quote.at)}
                    </figcaption>
                  </figure>
                )}
              </>
            )}
          </div>
        </div>

        {/* WHAT IT MOVED */}
        <div className="rounded-card overflow-hidden bg-midnight px-5 sm:px-8 py-5">
          <p className="t-caption text-white/45">What it moved</p>
          {/* ⚠ AND IT SAYS WHEN NOTHING MOVED. Win, stay 4th, and it reads
              "4th" with no arrow — a block that only ever reports good news is
              not a record, it is a slot machine. */}
          {position.now !== null && (
            <MovedRow label="Your position">
              {position.before !== null && position.before !== position.now ? (
                <>
                  <span className="text-white/45">{ordinal(position.before)}</span>
                  <span className={`mx-1.5 ${
                    position.now < position.before ? 'text-success-400' : 'text-danger-400'}`}>&rarr;</span>
                  <span className={position.now < position.before ? 'text-success-400' : 'text-danger-400'}>
                    {ordinal(position.now)}
                  </span>
                </>
              ) : (
                <span>{ordinal(position.now)}</span>
              )}
            </MovedRow>
          )}
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

        <ShareButton url={shareUrl} />

        <Link
          href={`/pools/${poolId}`}
          className="rounded-pill text-ink dark:text-white t-caption text-center py-3.5
                     hover:bg-white/5 transition-colors border border-border-default"
        >
          Back to the pool
        </Link>
      </div>
    </main>
  )
}
