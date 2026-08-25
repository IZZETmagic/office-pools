'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import type { PoolRoundState, EntryRoundSubmission, RoundStateValue } from '@/app/pools/[pool_id]/types'
import { isMatchweekKey, roundLabel } from '@/lib/competitionRounds'

type RoundStatusCardProps = {
  roundState: PoolRoundState
  submission: EntryRoundSubmission | null
  matchCount: number
  completedMatchCount: number
  /**
   * Picks MADE by this entry, for the completion ring. Distinct from
   * `completedMatchCount`, which counts fixtures that have been PLAYED — a fact
   * about the calendar, not about the member. The card previously showed only
   * the latter, on the one screen whose entire subject is the former.
   */
  predictedCount?: number
}

function getStateBadge(state: RoundStateValue) {
  switch (state) {
    case 'locked':
      return <Badge variant="gray">Locked</Badge>
    case 'open':
      return <Badge variant="blue">Open</Badge>
    case 'in_progress':
      return <Badge variant="yellow">In Progress</Badge>
    case 'completed':
      return <Badge variant="green">Completed</Badge>
  }
}

function getSubmissionStatus(
  roundState: PoolRoundState,
  submission: EntryRoundSubmission | null
): { label: string; color: string } {
  if (roundState.state === 'locked') {
    return { label: 'Not yet available', color: 'text-neutral-400' }
  }
  if (submission?.has_submitted) {
    if (submission.auto_submitted) {
      return { label: 'Auto-submitted', color: 'text-amber-600' }
    }
    return { label: 'Submitted', color: 'text-green-600' }
  }
  if (roundState.state === 'completed' || roundState.state === 'in_progress') {
    const isPastDeadline = roundState.deadline && new Date(roundState.deadline) < new Date()
    if (isPastDeadline) {
      return { label: 'Missed', color: 'text-red-600' }
    }
  }
  return { label: 'Draft', color: 'text-amber-600' }
}

/**
 * @param emphasis Render as the strip's headline figure rather than a value in
 *   a label/value row. Off by default so the World Cup card is unchanged.
 */
function CountdownTimer({ deadline, emphasis = false }: { deadline: string; emphasis?: boolean }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date().getTime()
      const target = new Date(deadline).getTime()
      const diff = target - now

      if (diff <= 0) {
        setTimeLeft('Deadline passed')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`)
      } else {
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  const msLeft = new Date(deadline).getTime() - new Date().getTime()
  const isPast = msLeft < 0

  if (!emphasis) {
    return (
      <span className={isPast ? 'text-red-600 font-medium' : 'text-neutral-700 font-medium'}>
        {timeLeft}
      </span>
    )
  }

  /**
   * ⚠ `t-num`, not the body face.
   *
   * The design system is explicit that "every number in the app — ranks,
   * points, scores, levels — renders in a bold monospace face… the single most
   * recognisable part of the type system". A countdown is a number and this one
   * was rendering in Nunito at weight 500, which is why it read as a caption
   * rather than as the figure the strip exists to show.
   *
   * `t-num` also brings `tabular-nums`, which matters more here than anywhere
   * else in the app: this text rewrites itself every second, and proportional
   * digits made the whole strip twitch on each tick.
   *
   * The colour steps are the ones `app/pools/PoolsClient.tsx` already uses for
   * a deadline — three days and seven days — rather than a second scale that
   * would disagree with the pool list about what counts as urgent. It states a
   * fact the member can check; nothing is being manufactured to hurry them.
   */
  const dayMs = 86400000
  const tone = isPast
    ? 'text-danger-600'
    : msLeft <= 3 * dayMs
      ? 'text-danger-600'
      : msLeft <= 7 * dayMs
        ? 'text-warning-600'
        : 'text-ink'

  return <span className={`t-num t-num-extrabold text-base ${tone}`}>{timeLeft}</span>
}

export function RoundStatusCard({
  roundState, submission, matchCount, completedMatchCount, predictedCount = 0,
}: RoundStatusCardProps) {
  // ⚠ `roundLabel`, not `ROUND_LABELS[k] ?? k`. That fallback returns the RAW
  // KEY, so a league matchweek rendered as the string `mw_2` at the top of the
  // picking screen. lib/competitionRounds.roundLabel exists precisely for this
  // — its own comment says so — and this call site was missed.
  const roundName = roundLabel(roundState.round_key)
  // A league matchweek and a World Cup round lock on different rules, and the
  // key is enough to tell them apart — no extra prop to thread or forget.
  const isMatchweek = isMatchweekKey(roundState.round_key)
  const submissionStatus = getSubmissionStatus(roundState, submission)

  /**
   * ONE STRIP, for a matchweek.
   *
   *   [Matchweek 2] [status] ················· [ring] [deadline]
   *
   * The card used to stack four label/value rows and a progress bar. Three of
   * them said nothing a member could act on — see the notes below — and the one
   * that mattered, the deadline, was the third thing down. A matchweek header
   * is answering two questions ("which week, and how long have I got") plus one
   * glance ("have I done it"), so it is a strip rather than a table.
   *
   * ⚠ Written in the semantic tokens (`t-card-title`, `text-ink`, `text-muted`,
   * `rounded-card`, `bg-mist`) rather than the numeric scale it had before
   * (`text-neutral-900`, `bg-neutral-100`, `rounded-2xl`). The numeric classes
   * are not broken — globals.css redefines the whole scale for dark mode — but
   * every neighbouring component speaks the semantic vocabulary, and a file
   * that does not is where the drift starts.
   */
  if (isMatchweek) {
    const showDeadline =
      roundState.deadline && (roundState.state === 'open' || roundState.state === 'in_progress')

    /*
     * ⚠ A DIFFERENT SURFACE from the fixture cards below it.
     *
     * On `bg-surface` with `border-border-default` the header was pixel-wise
     * identical to the ten pick cards under it, so it read as the first row of
     * the list rather than as the thing that frames the list — which matchweek,
     * what state, how long is left.
     *
     * ⚠ NOT A CARD, and not brand blue. Both were tried and both were wrong.
     *
     * As a `bg-surface` card it was pixel-identical to the ten pick cards below
     * it and read as the first row of the list. Tinting it `primary-100` fixed
     * the sameness and introduced a worse problem: brand blue already means
     * "this is your pick" on the club buttons, so the screen had one colour
     * carrying two meanings — an interactive state and a structural frame.
     *
     * The distinction that actually holds is category, not hue. This is not an
     * object in the list, it is the LABEL for the list, so it stops pretending
     * to be a card: no fill, no card radius, just a hairline under it. Chrome
     * reads as chrome, content reads as content, and blue is left to mean
     * exactly one thing.
     */
    return (
      <div className="border-b border-border-default px-1 pb-3">
        {/* Wraps rather than overflows. At 375px "Matchweek 2 · Open · ring ·
            Locks in 3d 7h 59m" does not fit on one line, and with everything
            `shrink-0` the countdown was simply clipped by the viewport — the
            one number on the strip a member needs. Wrapped, the right-hand
            group drops to its own line and stays right-aligned. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 className="t-card-title text-ink shrink-0">{roundName}</h3>
          {getStateBadge(roundState.state)}

          <div className="ml-auto flex items-center gap-3 shrink-0">
            {matchCount > 0 && (
              <CompletionRing made={predictedCount} total={matchCount} />
            )}
            {showDeadline && (
              /* ⚠ LABEL THE COUNTDOWN. On its own "3d 8h 2m" is a duration with
                 no referent — it could be until kickoff, until results, until
                 anything. It read as a deadline only to someone who already
                 knew it was one, which is nobody opening this screen for the
                 first time.

                 "Locks in" rather than "Deadline" because it is the verb the
                 rest of the product uses for this exact moment — the Scoring
                 Rules screen says "It locks at the first kickoff", and the
                 locked matchweek says "Opens as soon as the previous matchweek
                 locks". One word, one meaning, everywhere.

                 The accessible name carries the whole sentence, because
                 "Locks in 3d 8h 2m" still leaves a screen-reader user to infer
                 what locks. */
              <span
                className="flex items-baseline gap-1.5"
                aria-label="Time left to make your picks for this matchweek"
              >
                <span className="t-body text-muted" aria-hidden="true">Locks in</span>
                <CountdownTimer deadline={roundState.deadline!} emphasis />
              </span>
            )}
          </div>
        </div>

        {/* The one state that still needs a sentence. Locked says its piece in
            the empty state below the card, and open needs nothing beyond the
            countdown already on the strip. */}
        {submissionStatus.label === 'Missed' && (
          <p className="t-body text-danger-600 mt-2.5">
            You missed the deadline for this matchweek. You scored 0 points for it, and the
            next one is already open.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="bg-surface border border-border-default rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-900">{roundName}</h3>
        {getStateBadge(roundState.state)}
      </div>

      {/* Deadline & countdown */}
      {roundState.deadline && (roundState.state === 'open' || roundState.state === 'in_progress') && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Deadline</span>
          <CountdownTimer deadline={roundState.deadline} />
        </div>
      )}

      {/* Submission status */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Status</span>
        <span className={submissionStatus.color}>{submissionStatus.label}</span>
      </div>

      {/* Match progress */}
      {roundState.state !== 'locked' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Matches completed</span>
            <span>{completedMatchCount} / {matchCount}</span>
          </div>
          <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: matchCount > 0 ? `${(completedMatchCount / matchCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Locked message */}
      {roundState.state === 'locked' && (
        <p className="text-xs text-neutral-400 italic">
          Available after the previous round completes
        </p>
      )}

      {/* Missed round message */}
      {submissionStatus.label === 'Missed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs text-red-700">
            You missed the deadline for this round. You scored 0 points but can still predict future rounds.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * Picks made, as a ring.
 *
 * A ring rather than a bar because it sits at the end of a one-line strip where
 * a bar would need width the strip does not have — and because "how much of
 * this have I done" is a proportion, which a circle states without a scale.
 *
 * The count goes in the middle rather than beside it: the denominator is
 * already drawn by the arc, so the number a member wants is how many they have
 * left to do. Complete swaps to a tick, because at that point the number is not
 * the news.
 */
function CompletionRing({ made, total }: { made: number; total: number }) {
  const pct = total > 0 ? Math.min(1, made / total) : 0
  const done = total > 0 && made >= total
  const r = 13
  const c = 2 * Math.PI * r

  return (
    <span
      className="relative inline-flex items-center justify-center shrink-0"
      role="img"
      aria-label={`${made} of ${total} predictions made`}
      title={`${made} of ${total} predictions made`}
    >
      <svg width="32" height="32" viewBox="0 0 32 32" className="-rotate-90">
        <circle cx="16" cy="16" r={r} fill="none" strokeWidth="3" className="stroke-mist" />
        <circle
          cx="16" cy="16" r={r} fill="none" strokeWidth="3" strokeLinecap="round"
          className={done ? 'stroke-success-500' : 'stroke-primary-600'}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: 'stroke-dashoffset 300ms ease' }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center">
        {done ? (
          <Icon name="checkmark" size={13} className="text-success-500" />
        ) : (
          <span className="t-num text-[10px] text-ink">{made}</span>
        )}
      </span>
    </span>
  )
}
