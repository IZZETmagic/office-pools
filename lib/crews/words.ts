// Crews on the web — the words the dashboard strip and the crew page use.
//
// ⚠ MIRRORS mobile/lib/crews.ts, which owns these sentences on the phone. Mobile is a separate
// project (its `@/` is its own root) so neither side can import the other; __tests__/words.test.ts
// runs both on the same inputs and fails the day they drift. Change both together.
//
// ⚠ Never summed points, anywhere: all-time is seasons · titles · best finish.
// ⚠ Last Man Standing has no rank — a finish of `null` reads "Played", never "—th".
//
// PURE — no React, no Supabase.

import type { CrewCard, CrewDetail, Person } from './read'
import type { CrewRole } from './rules'

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd. */
export function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

export function personName(p: Pick<Person, 'fullName' | 'username'> | null | undefined): string {
  return p?.fullName?.trim() || p?.username?.trim() || 'Someone'
}

/** First name only, for tight places ("Dave leads all-time"). */
export function shortName(p: Pick<Person, 'fullName' | 'username'> | null | undefined): string {
  const full = personName(p)
  return full.split(/\s+/)[0] ?? full
}

export function roleLabel(role: CrewRole | null | undefined): string | null {
  if (role === 'captain') return 'Captain'
  if (role === 'co_captain') return 'Co-captain'
  return null
}

/** "Jun 2026". */
export function monthYear(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/** The card's second line: "14 people · 3 seasons since Jun 2026". */
export function crewSummary(c: Pick<CrewCard, 'people' | 'seasons' | 'since'>): string {
  const since = monthYear(c.since)
  return [plural(c.people, 'person', 'people'), c.seasons ? plural(c.seasons, 'season') : 'no seasons yet']
    .join(' · ')
    .concat(since ? ` since ${since}` : '')
}

/** The status chip. Something to act on, then something happening, then the last season. */
export function crewStatusText(s: CrewCard['status']): string {
  if (s.kind === 'seat') return `Your spot’s saved · ${s.competition}`
  if (s.kind === 'live') return `Playing now · ${s.competition}`
  if (s.kind === 'disbanded') return 'Disbanded · only you can see this'
  return s.competition ? `Last played ${s.competition}` : 'No seasons yet'
}

/** "Dave leads all-time" / "You lead all-time" — null until a season has finished with ranks. */
export function leaderText(c: Pick<CrewCard, 'leader'>, viewerId: string | null): string | null {
  if (!c.leader) return null
  if (c.leader.userId === viewerId) return 'You lead all-time'
  return `${shortName(c.leader)} leads all-time`
}

/** "You're 4th all-time" — null until the viewer has a ranked finish. */
export function meText(c: Pick<CrewCard, 'me'>): string | null {
  if (c.me.position === null) return null
  return c.me.position === 1 ? 'You’re top all-time' : `You’re ${ordinal(c.me.position)} all-time`
}

/** "3rd of 12", or "Played" when the mode has no rank (Last Man Standing). */
export function finishText(rank: number | null, players: number): string {
  if (rank === null) return 'Played'
  return players > 0 ? `${ordinal(rank)} of ${players}` : ordinal(rank)
}

/** "Won by Dave", "Won by Dave and Priya", "" when nobody has a rank. */
export function winnersText(winners: Pick<Person, 'fullName' | 'username'>[]): string {
  if (winners.length === 0) return ''
  const names = winners.map(shortName)
  return `Won by ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}`
}

/** Who leads after someone leaves — for the Leave confirmation. */
export function leaveConsequence(d: Pick<CrewDetail, 'viewer' | 'members'>): string {
  if (d.viewer.role !== 'captain') return 'Your history stays, and you can rejoin from here any time.'
  const others = d.members.filter((m) => m.role !== 'captain')
  if (others.length === 0) return 'You’re the last one in it, so the crew will close. Its history stays.'
  const co = others.find((m) => m.role === 'co_captain')
  const next = co ?? [...others].sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0]
  return `${shortName(next)} will become captain${co ? '' : ' — the longest-standing member'}. Your history stays.`
}

/** Linking a pool you run (2026-10-03) — the confirmation, said before the tap. */
export const LINK_CONSEQUENCE =
  'Its seasons count in the crew’s history, and anyone in the crew can join it from here. A pool stays with its crew for good, and crew pools are private.'

/** Under "Also playing together". */
export const LINK_HINT = 'Pools you run where everyone’s already in the crew. Linking adds the season to its history — nobody new joins.'

/** "Same 3 people as the crew" / "2 of the crew’s 3". */
export function linkablePeopleText(players: number, crewSize: number): string {
  return players >= crewSize ? `Same ${plural(players, 'person', 'people')} as the crew` : `${players} of the crew’s ${crewSize}`
}

/** Disband's confirmation — said before the tap (157). */
export const DISBAND_CONSEQUENCE =
  'It disappears for everyone in it. Saved spots nobody has taken are released, and pools already running carry on as ordinary pools. You can restore it later from My Crews.'

/** What the captain sees on a crew they disbanded (157). */
export const DISBANDED_NOTICE =
  'Nobody else can see it. Restore it and everyone’s back as they were — saved spots that were released stay released.'

/**
 * The Needs you deadline pill: "40m left", "5h left", then "Sat 7:30 pm".
 *
 * ⚠ CLIENT ONLY. It reads the runtime's clock and timezone, so on the server it would print the
 * server's (UTC) — render it through components/LocalTime. Mirrors mobile's NeedsYouCard.deadlineLabel.
 */
export function deadlineLabel(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m left`
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h left`
  const d = new Date(iso)
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const h = d.getHours()
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`
}

/**
 * What the captain sees before pressing Invite on an email — the email's own first line.
 *
 * ⭐ THE OWNER on the web: lib/crews/notify.invitePreview calls this, so the line shown and the line
 * sent cannot differ. Lives here rather than in notify.ts because notify imports the mailer and the
 * push sender, which a browser bundle can't. Mirrored by mobile/lib/crews.invitePreviewText.
 */
export function invitePreviewText(inviter: string, crewName: string): string {
  return `${inviter} asked us to invite you to ${crewName} on SportPool…`
}

// ── Starting a pool for a crew ──────────────────────────────────────────────────────────────────
// Mirrors of mobile/lib/createPool.ts (crewAlreadyPlaying, seatSelectionProblem).

/**
 * Is this crew already playing the competition? Decision 2's guard — a CONFIRM rather than a block
 * (2026-10-02): Pick'em and Last Man Standing on the same season is the range of formats working,
 * not a mistake, but the starter should know before making a second.
 */
export function crewAlreadyPlaying<
  P extends { poolName: string; competition: string; leagueSeasonId: string | null; tournamentId: string },
>(playingNow: P[], competition: { tournament_id: string; league_season_id: string | null }): P | null {
  return (
    playingNow.find((p) =>
      competition.league_season_id
        ? p.leagueSeasonId === competition.league_season_id
        : !p.leagueSeasonId && p.tournamentId === competition.tournament_id,
    ) ?? null
  )
}

/**
 * Saved spots never exceed what the pool holds (decision 7). null when the choice fits; otherwise
 * the sentence to show — the server refuses the same thing (rules.seatSelectionError).
 */
export function seatSelectionProblem(chosen: number, spots: number | null): string | null {
  if (spots === null || chosen <= spots) return null
  const over = chosen - spots
  return `A Free pool holds ${spots + 1}, so ${spots} can have a saved spot — untick ${over} more.`
}
