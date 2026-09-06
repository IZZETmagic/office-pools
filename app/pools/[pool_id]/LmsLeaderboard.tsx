'use client'

// =============================================================
// LAST MAN STANDING — who is left, and who has taken a round
// =============================================================
// Ported from `mobile/components/pool-detail/LmsLeaderboard.tsx`, which shipped
// 2026-09-03. The reasoning below is that file's, kept here because the web was
// still rendering the generic board — and the generic board is wrong for this
// mode in a specific, silent way.
//
// ## The mode has no points, so a score column is a column of zeros
//
// `total_points` is 0 for every entry in Last Man Standing and always will be.
// The World Cup leaderboard put that zero under a "Points" heading for every
// member of every LMS pool, which reads as "nobody has scored" rather than
// "this mode does not score". What people actually come here to read is whether
// they are still in.
//
// ## Two truths at once, and the season leads
//
// A round is a few matchweeks; a season is a run of rounds. The season score is
// `rounds_won` and the round's question is binary. So the list is ordered rounds
// won first — done server-side in `compareLms`, the SAME function the mobile
// leaderboard sorts with — and each row states its own round position. A
// two-time winner sitting top in a week they are out is correct, and the
// `OUT · MW6` chip is what stops it reading as a claim to still be alive.
//
// ⚠ In round one every `rounds_won` is 0, so the order collapses to pure
// survival: standing above out, and the out ordered by who lasted longer. That
// is the common case, and it is meant to look like the simple thing.
//
// ## No rank numbers
//
// Survival is binary — three survivors are equally alive, and numbering them
// #1/#2/#3 would invent a hierarchy the football has not produced and tell
// somebody they are last of the survivors when they are not. The eliminated do
// not get numbers either: the matchweek they went out in is the number that
// means something, and it is already on the row.
//
// ⚠ AND THE STORED RANK IS UNUSABLE HERE ANYWAY. `current_rank` is entry_id
// order in this mode, which is why `LeagueLeaderboardRow` ships it as NULL for
// LMS rather than handing over a wrong answer that looks like a right one.
//
// ## The trophy is the whole memory of a round
//
// `league_lms_settle` opens the next round in the same transaction that closes
// one, so the instant a round is won everybody is back in and the survival
// column resets. Nothing else on this screen records that the round happened.
// That is why `rounds_won` is on the row and not tucked into a season summary.
//
// ## Nothing here decides anything
//
// Survival, elimination and round winners are all `league_lms_settle`'s. The
// ordering is the reader's. This renders the record.
// =============================================================

import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import type { LeagueLeaderboard, LeagueLeaderboardRow } from '@/lib/league/leaderboard'

type Props = {
  board: LeagueLeaderboard
  /** The viewer's own entries — what the YOU pill and the row tint key on. */
  myEntryIds: Set<string>
}

export default function LmsLeaderboard({ board, myEntryIds }: Props) {
  const rows = board.rows

  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <p className="text-sm text-neutral-600 font-medium">No entries yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            The leaderboard fills up once people join and start picking.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      <RoundStrip round={board.lms} />
      {rows.map((row) => (
        <SurvivorRow key={row.entry_id} row={row} isMe={myEntryIds.has(row.entry_id)} />
      ))}
    </div>
  )
}

/**
 * The round, and how many are left in it.
 *
 * ⚠ "of N" is the number IN THE ROUND, not the pool's membership. Someone who
 * joined after the round opened is not in it — counting them would make the pool
 * look like it had lost more people than it has.
 */
function RoundStrip({ round }: { round: LeagueLeaderboard['lms'] }) {
  if (!round) {
    return (
      <p className="text-center text-xs text-neutral-500 py-1">No round has opened yet</p>
    )
  }

  const isOver = round.last_matchweek !== null

  return (
    <div className="rounded-xl bg-primary-600/7 px-3 py-2 text-center">
      <p className="flex items-center justify-center gap-1.5 text-xs font-semibold text-neutral-900">
        <Icon
          name={isOver ? 'checkmark.seal.fill' : 'flame.fill'}
          size={12}
          className={isOver ? 'text-success-600' : 'text-primary-600'}
        />
        {isOver
          ? `Round ${round.round_number} is over`
          : `Round ${round.round_number} · ${round.standing} still standing of ${round.in_round}`}
      </p>
      <PickWeekNote round={round} />
    </div>
  )
}

/**
 * Which matchweek the crests on the rows belong to.
 *
 * ⚠ Without this the badges are ambiguous, and dangerously so. From Friday to
 * Monday the week being PLAYED and the week you can still PICK for are different
 * weeks — a crest with no caption reads as "the club playing for them right now"
 * whichever one it actually is. The row shows one club; this says which question
 * it answers.
 */
function PickWeekNote({ round }: { round: NonNullable<LeagueLeaderboard['lms']> }) {
  if (round.pick_matchweek === null || round.last_matchweek !== null) return null

  return (
    <p className="text-[11px] text-neutral-500 mt-0.5">
      {round.pick_in_play
        ? `Backing these clubs in MW${round.pick_matchweek}, in play now`
        : `Backing these clubs in MW${round.pick_matchweek} — hidden until it locks`}
    </p>
  )
}

function SurvivorRow({ row, isMe }: { row: LeagueLeaderboardRow; isMe: boolean }) {
  const name = row.entry_name?.trim() ? row.entry_name : row.full_name
  const lms = row.lms
  const isStanding = !!lms?.in_round && lms.eliminated_matchweek === null

  return (
    <div
      // ⚠ `bg-surface`, NEVER `bg-white`. The token flips to #1C2030 under the
      // dark theme; a literal white shipped rows of pale-grey names on white and
      // was invisible until the harness was opened in dark mode.
      className={`flex items-center gap-3 rounded-xl border p-3 ${
        isMe ? 'border-primary-600/25 bg-primary-600/8' : 'border-border-default bg-surface'
      } ${
        // Eliminated rows recede rather than disappear. They are still part of
        // the pool and still worth reading — the round happened to them too.
        isStanding ? '' : 'opacity-[0.72]'
      }`}
    >
      <StateDot lms={lms} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-bold text-neutral-900 truncate">{name}</span>
          {isMe && (
            <span className="shrink-0 rounded-full bg-primary-600/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-primary-600">
              YOU
            </span>
          )}
        </div>
        <p className="text-[11px] text-neutral-500 truncate">@{row.username}</p>
      </div>

      <RoundsWon count={lms?.rounds_won ?? 0} />
      <StateChip lms={lms} isMe={isMe} />
    </div>
  )
}

/** A colour before any words — the row's state readable at a glance down the list. */
function StateDot({ lms }: { lms: LeagueLeaderboardRow['lms'] }) {
  const tone = !lms?.in_round
    ? 'bg-neutral-400'
    : lms.eliminated_matchweek === null
      ? 'bg-success-600'
      : 'bg-danger-600'
  return <span className={`shrink-0 w-2.5 h-2.5 rounded-full ${tone}`} />
}

/**
 * Rounds taken this season.
 *
 * ⚠ Rendered only when there is at least one. A "0×" beside every name in round
 * one would be a column of zeros with extra steps, and that is the thing this
 * screen exists to avoid.
 */
function RoundsWon({ count }: { count: number }) {
  if (count < 1) return null

  return (
    <span
      className="shrink-0 flex items-center gap-0.5 text-accent-600"
      title={`${count} round${count === 1 ? '' : 's'} won`}
    >
      <Icon name="trophy.fill" size={13} />
      {count > 1 && <span className="text-[11px] font-bold">×{count}</span>}
    </span>
  )
}

/**
 * What the row says about this round.
 *
 * ⚠ THREE STATES, NOT TWO. "Next round" is NOT an elimination. Somebody who came
 * in after the round opened enters the next one — everybody already in it has
 * spent clubs, and a newcomer with a full twenty would have an advantage nobody
 * else had. Painting them the same red as the eliminated would accuse them of
 * losing a round they were never allowed to play.
 *
 * ⚠ THE ELIMINATED KEEP THEIR MATCHWEEK. Knowing WHEN somebody went out is the
 * useful half — a name with no week is just a loser, a name with MW2 is a story.
 *
 * A survivor shows the club they are backing instead, which is the same
 * information told forwards: still in, and here is what is carrying you.
 */
function StateChip({ lms, isMe }: { lms: LeagueLeaderboardRow['lms']; isMe: boolean }) {
  if (!lms) return null

  if (!lms.in_round) return <Chip label="NEXT ROUND" tone="text-neutral-500 bg-neutral-500/14" />
  if (lms.eliminated_matchweek !== null) {
    return <Chip label={`OUT · MW${lms.eliminated_matchweek}`} tone="text-danger-600 bg-danger-600/14" />
  }

  // Still in — the club is the chip.
  if (lms.pick) return <ClubChip club={lms.pick} />

  // ⚠ Sealed is not "no pick". Their matchweek has not locked, so their club is
  // hidden from everybody but them (migration 086 — otherwise the pool copies
  // the best player). The padlock says which of the two this is; a blank would
  // let it be read as a member who has not bothered.
  if (lms.pick_sealed) {
    return (
      <span className="shrink-0 flex items-center gap-1 rounded-full bg-neutral-500/12 px-2 py-0.5">
        <Icon name="lock.fill" size={9} className="text-neutral-500" />
        <span className="text-[9px] font-bold tracking-wider text-neutral-500">HIDDEN</span>
      </span>
    )
  }

  // Nothing picked, and nothing hiding it. On your own row that is a real nudge;
  // on somebody else's it is a fact the whole pool can already see.
  return (
    <Chip
      label="NO PICK"
      tone={isMe ? 'text-danger-600 bg-danger-600/14' : 'text-neutral-500 bg-neutral-500/14'}
    />
  )
}

/**
 * The club carrying them this matchweek — the crest alone.
 *
 * No pill and no name. A green pill would say "still in" a second time when the
 * dot at the head of the row already does, and a badge carries its own club
 * faster than a name does to anyone who follows football.
 *
 * ⚠ `crest_url` is NULLABLE in the feed, so the name is the fallback and never
 * the other way round. Without it a club with no badge is a blank cell, which
 * reads as a member who has not picked — the one thing this chip must never be
 * confused with.
 */
function ClubChip({ club }: { club: { club_name: string; crest_url: string | null } }) {
  if (!club.crest_url) {
    return (
      <span className="shrink-0 max-w-[92px] truncate text-[10px] font-bold text-neutral-900">
        {club.club_name}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={club.crest_url}
      // The badge IS the label once the name is gone, so it has to be one to
      // anything that cannot see it.
      alt={club.club_name}
      title={club.club_name}
      className="shrink-0 w-[34px] h-[34px] object-contain"
    />
  )
}

function Chip({ label, tone }: { label: string; tone: string }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider ${tone}`}>
      {label}
    </span>
  )
}
