'use client'

// =============================================================
// SHOWDOWN — your duel, your record, and who you play next
// =============================================================
// The mode's whole appeal is that a 38-week parallel pick'em becomes a personal
// league: by November you have a named rival and a head-to-head record.
//
// ## ⚠ THE DRAW IS SEALED — this tab used to argue the opposite
//
// It used to carry a section headed "Why the fixture list is shown in advance",
// ending "a schedule we have already computed and withhold is a different kind
// of manipulation". Ryan overturned that on 2026-08-30: the draw is hidden and
// opens one matchweek at a time, so who you are playing is a surprise each week.
//
// What did NOT change is the round-robin. Gate 5 was satisfied by drawing a
// rotation rather than pairing at random each week — nobody faces the strong
// pickers more often than anybody else — and hiding *when you learn* the pairing
// changes no outcome. What changed is disclosure, and that is handled by saying
// plainly what happens: the season is drawn at pool creation and opens weekly.
// See `leagueModeInfo.ts`, which carries the sentence a member actually reads.
//
// ## Two things this tab no longer shows
//
// The season fixture list and the "Coming up" list of future opponents. They are
// not hidden here — they are NOT IN THE PROPS. Migration 116's RLS policy
// withholds the rows, so `duels` contains only matchweeks that have opened. Do
// not add them back: this component could not render them if it tried.
//
// That is also why `sealedMatchweek` and `sealedOpensAfter` are passed
// separately: the sealed card needs numbers that no longer arrive with the
// duels, because the whole point is that those rows are gone.
//
// ## ⚠ ONE DUEL AT A TIME (migration 119)
//
// A duel opens when the matchweek BEFORE it settles, so through a matchweek
// there is exactly one live duel and the next opponent is not knowable. The
// `open` card below therefore renders only BETWEEN rounds — once your duel is
// decided and before the next one locks. Nothing here enforces that; it falls
// out of RLS withholding the rows, which is the right place for it.
//
// ## No heading, no explainer — the duel is the first thing on the page
//
// The tab opened with "Your duels" and a paragraph explaining the format, which
// pushed the head-to-head card below the fold of attention. Ryan, 2026-08-30:
// the head-to-head card comes first, front and centre.
//
// ⚠ THE DISCLOSURE SENTENCE DID NOT GO WITH IT. "Revealed once matchweek N is
// decided — or a day before you pick" still sits on the SEALED CARD, which is
// where a member is actually asking the question, and the full explanation is
// on Pool Info and Scoring Rules. Removing the paragraph moved the sentence
// closer to the doubt; it did not delete it. `leagueModeCopy.guard.test.ts`
// holds the wording on the surfaces that keep it.
//
// ## Nothing here computes a score
//
// Points come from `league_duels`, written by `league_score_duels` when the
// matchweek is both fully played and fully scored.
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { headToHead, type DuelRow } from '@/lib/league/duels'
import { getLiveClock } from '@/lib/matchStatus'
import { LocalTime } from '@/components/LocalTime'
import type { MatchweekFixture } from './PoolDetail'

type Props = {
  duels: DuelRow[]
  /** entry_id → display name, for both sides of every duel. */
  entryNames: Map<string, string>
  /** The viewer's own entries, so their duels can be picked out. */
  ownEntryIds: string[]
  /**
   * The matchweek open for PICKS. Null once the season is over.
   *
   * ⚠ NOT the same week as the duel being played, and this tab used to be given
   * only this one. MW2 locks at its own first kickoff on the Friday, so all
   * weekend "this week's duel" was MW3 — the one nobody had played yet — while
   * the duel that was actually being decided sat further down the page under
   * "Coming up". Ryan caught the same conflation on the pools-list tile.
   */
  openMatchweek: number | null
  /** The matchweek being played right now. Null between rounds. */
  inPlayMatchweek: number | null
  /**
   * The first matchweek still SEALED, and the matchweek that has to FINISH
   * before it opens (migration 119). Null at the end of the season.
   */
  sealedMatchweek: number | null
  sealedOpensAfter: number | null
  /** The LATEST the duel can open — 24h before its own lock (migration 120). */
  sealedOpensAtLatest: string | null
  /** entry_id → the person behind it, for the faces in the corners. */
  entryPeople: Map<string, AvatarPerson>
  /**
   * The RUNNING score of the matchweek being played, and how many of its
   * fixtures have been scored so far.
   *
   * ⚠ The duel row's own `accuracy_a/_b` are NULL until the matchweek settles,
   * so through the weekend — the one time anybody is watching — they cannot
   * drive the card. These come from `league_match_scores`.
   */
  livePoints: Map<string, number>
  /** entry_id → fixture_number → points, for the fixture-by-fixture breakdown. */
  perFixture: Map<string, Map<number, number>>
  /** Every fixture of the live matchweek, scored or not. */
  fixtures: MatchweekFixture[]
  /**
   * Everyone's Results-depth taps and full predictions, REVEAL-GATED by the
   * bulk route — a matchweek still open for picks is not in here at all.
   *
   * ⚠ That gate is the only thing standing between this card and showing an
   * opponent's picks before lock. It is enforced server-side in
   * `app/api/pools/[pool_id]/bulk/route.ts`; nothing in this component may
   * reconstruct picks from another source.
   */
  leagueOutcomes: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
  allPredictions: Array<{ entry_id: string; match_id: string; predicted_home_score: number; predicted_away_score: number }>
  bulkState: 'idle' | 'loading' | 'ready' | 'error'
  /** Season totals per entry — points, rank, duel points. */
  totals: Map<string, { totalPoints: number; rank: number | null; duelPoints: number; correct: number }>
  /** Last five score types per entry, oldest first. Same source as the leaderboard's dots. */
  form?: Map<string, string[]>
  /** Duel points per entry, from the leaderboard read. */
  duelPoints: Map<string, number>
}

type Side = { entry: string; points: number | null; accuracy: number | null }

/**
 * A ticking countdown to an instant.
 *
 * ⚠ CLIENT-ONLY, like `components/LocalTime` and for the same reason: a value
 * derived from `Date.now()` differs between the server render and the first
 * client render, and React keeps the server text rather than reconciling it.
 * So it renders nothing until mounted, then ticks.
 */
function Countdown({ to }: { to: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const target = new Date(to).getTime()
    const tick = () => {
      const ms = target - Date.now()
      if (ms <= 0) { setText('any moment'); return }
      const s = Math.floor(ms / 1000)
      const d = Math.floor(s / 86400)
      const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setText(d > 0 ? `${d}d ${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [to])
  return <>{text}</>
}

/**
 * One side's pick for one fixture.
 *
 * ⚠ A pick both members share is DRAWN DOWN, not up. Agreements cannot separate
 * two people — whoever is right, both get the same — so the sheet's whole job is
 * to make the divergences findable. Colouring every chip would bury them.
 *
 * A null label is a pick the reveal gate has not released. It renders as a
 * dash, never as "no pick": this component cannot tell withheld from never-made
 * and must not guess.
 */
function PickChip({
  label, side, outcome, align = 'left',
}: {
  label: string | null
  side: 'you' | 'them'
  /** Who took the fixture. Absolute — no chip flips it. */
  outcome: 'same' | 'you' | 'them' | 'neither' | 'pending'
  align?: 'left' | 'right'
}) {
  if (label === null) {
    return (
      <span className={`t-num t-num-medium text-xs text-muted/40 block ${align === 'right' ? 'text-right' : ''}`}>
        &mdash;
      </span>
    )
  }
  const won = outcome === side
  const tone =
    won ? (side === 'you' ? 'bg-primary-500 text-white' : 'bg-danger-500 text-white')
      : outcome === 'same' ? 'bg-mist text-muted'
        : side === 'you' ? 'border border-primary-500/40 text-primary-600'
          : 'border border-danger-500/40 text-danger-600'

  return (
    <span className={`block ${align === 'right' ? 'text-right' : ''}`}>
      <span
        className={`inline-flex items-center justify-center gap-1 t-detail uppercase tracking-wider rounded-md px-1.5 sm:px-2 py-1 w-full sm:w-auto sm:min-w-[3.25rem] ${tone}`}
        title={won ? 'Took this one'
          : outcome === 'same' ? 'Same pick — cannot separate you'
            : outcome === 'neither' ? 'Different picks, neither scored'
              : undefined}
      >
        {label}
        {/* The win marker. Colour alone cannot carry it: an outline means both
            "waiting" and "did not take it", and a solid grey means "you picked
            the same". The tick is the only unambiguous "this one was mine". */}
        {won && <span aria-hidden="true" className="text-[0.9em] leading-none">&#10003;</span>}
      </span>
    </span>
  )
}

/**
 * Two numbers either side of a fixed dash.
 *
 * The dash sits in the same place on every row and the numbers grow outwards
 * from it, so a column of scores reads down cleanly whether it is "1-4" or
 * "300-400". A single centred string cannot do that: it centres the STRING, and
 * a longer one pushes its own digits sideways.
 *
 * `t-num` is tabular, so equal digit counts occupy equal width and the
 * alignment holds without measuring anything.
 */
function Scoreline({
  left, right, live = false,
}: { left: number | null; right: number | null; live?: boolean }) {
  return (
    <span className={`inline-grid grid-cols-[1fr_auto_1fr] items-baseline t-num t-num-extrabold text-sm whitespace-nowrap
      ${live ? 'text-danger-600' : 'text-ink'}`}>
      <span className="text-right">{left}</span>
      <span className="text-muted/40 font-normal px-0.5">&ndash;</span>
      <span className="text-left">{right}</span>
    </span>
  )
}

/**
 * One member in someone else's duel: a face, a name, and whether they are ahead.
 *
 * Mirrored like the fixture row — avatar outermost, name inboard — so the two
 * cards share a reading direction. `dimmed` rather than a second colour: these
 * duels are not the viewer's, and colouring them would compete with the blue
 * and red that mean "you" and "your opponent" everywhere else on the tab.
 */
function DuelSide({
  name, person, leading, dimmed, align = 'left',
}: {
  name: string
  person: AvatarPerson | null
  leading: boolean
  dimmed: boolean
  align?: 'left' | 'right'
}) {
  const face = person
    ? <span className="shrink-0"><Avatar person={person} size={28} /></span>
    : <span className="w-7 h-7 rounded-full bg-mist shrink-0" aria-hidden="true" />
  const label = (
    <span className={`t-body truncate ${leading ? 'text-ink font-bold' : 'text-muted'}`}>{name}</span>
  )
  // Avatar outermost, name inboard — and the group is pushed to the card's own
  // edge by `justify`, not centred. Children are ordered explicitly rather than
  // flipped with `flex-row-reverse`, because reverse also inverts what
  // `justify-end` means and the two fight each other.
  return (
    <span className={`flex items-center gap-2.5 min-w-0 ${align === 'right' ? 'justify-end' : 'justify-start'} ${dimmed ? 'opacity-55' : ''}`}>
      {align === 'right' ? <>{label}{face}</> : <>{face}{label}</>}
    </span>
  )
}

/**
 * A club crest, or nothing. Never a broken image and never a placeholder box.
 *
 * ⚠ LARGER ON A PHONE THAN ON A DESKTOP, which looks backwards and is not:
 * above `md` the club name sits beside it and the crest is decoration, below
 * `md` the crest IS the club.
 */
function Crest({ url, name }: { url: string | null; name: string }) {
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" aria-hidden="true" title={name}
      className="w-8 h-8 md:w-6 md:h-6 object-contain shrink-0" loading="lazy" />
  )
}

/** Kickoff, in the VIEWER's timezone — never the server's. See components/LocalTime. */
function formatKickoff(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/** 1 -> 1st. Small enough to keep local; the app has no shared formatter. */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

export default function DuelsTab({
  duels,
  entryNames,
  ownEntryIds,
  openMatchweek,
  inPlayMatchweek,
  sealedMatchweek,
  sealedOpensAfter,
  sealedOpensAtLatest,
  entryPeople,
  livePoints,
  perFixture,
  fixtures,
  leagueOutcomes,
  allPredictions,
  bulkState,
  totals,
  form,
  duelPoints,
}: Props) {
  const own = useMemo(() => new Set(ownEntryIds), [ownEntryIds])

  /** Every duel the viewer is in, oriented so "you" is always the first side. */
  const mine = useMemo(() => {
    const out: Array<{
      duel: DuelRow
      you: Side
      them: Side | null
      matchweek: number
    }> = []
    for (const d of duels) {
      const iAmA = own.has(d.entry_a)
      const iAmB = d.entry_b !== null && own.has(d.entry_b)
      if (!iAmA && !iAmB) continue
      const you: Side = iAmA
        ? { entry: d.entry_a, points: d.points_a, accuracy: d.accuracy_a }
        : { entry: d.entry_b as string, points: d.points_b, accuracy: d.accuracy_b }
      const them: Side | null = iAmA
        ? (d.entry_b ? { entry: d.entry_b, points: d.points_b, accuracy: d.accuracy_b } : null)
        : { entry: d.entry_a, points: d.points_a, accuracy: d.accuracy_a }
      out.push({ duel: d, you, them, matchweek: d.matchweek_number })
    }
    return out.sort((a, b) => a.matchweek - b.matchweek)
  }, [duels, own])

  const record = useMemo(() => {
    let won = 0, drawn = 0, lost = 0, byes = 0
    for (const m of mine) {
      if (!m.duel.settled_at) continue
      if (!m.them) { byes++; continue }
      if (m.you.points === 3) won++
      else if (m.you.points === 1) drawn++
      else lost++
    }
    return { won, drawn, lost, byes }
  }, [mine])

  /**
   * The two duels that are actually happening, in that order.
   *
   * ⚠ THESE ARE DIFFERENT WEEKS FOR MOST OF THE WEEKEND, and collapsing them is
   * a mistake this tab has now made twice. `inPlayMatchweek` is being played;
   * `openMatchweek` is the one you can still pick. From Friday's kickoff to
   * Sunday night both exist at once.
   *
   * The first version of this file showed only the in-play one and left the
   * open one in a "Coming up" list. Sealing the draw deleted that list — so the
   * duel you were actively picking for stopped appearing anywhere, even though
   * its rows are revealed and in the payload. Caught in the browser on the
   * seeded pool: matchweek 2 was on screen, matchweek 4 was on screen as
   * sealed, and matchweek 3 — the one being picked — was nowhere.
   *
   * So both render, always, and each says which it is.
   */
  const inPlay = useMemo(
    () => (inPlayMatchweek === null ? null : mine.find((m) => m.matchweek === inPlayMatchweek) ?? null),
    [mine, inPlayMatchweek],
  )
  const open = useMemo(
    () =>
      openMatchweek === null || openMatchweek === inPlayMatchweek
        ? null
        : mine.find((m) => m.matchweek === openMatchweek) ?? null,
    [mine, openMatchweek, inPlayMatchweek],
  )

  // The duel table — everyone, by duel points. Built from the duels themselves
  // so it cannot disagree with the fixture list beside it.
  const table = useMemo(() => {
    const rows = new Map<string, { entry: string; w: number; d: number; l: number; pts: number }>()
    const ensure = (e: string) => {
      if (!rows.has(e)) rows.set(e, { entry: e, w: 0, d: 0, l: 0, pts: 0 })
      return rows.get(e)!
    }
    for (const duel of duels) {
      ensure(duel.entry_a)
      if (duel.entry_b) ensure(duel.entry_b)
      if (!duel.settled_at) continue
      for (const [e, p] of [[duel.entry_a, duel.points_a], [duel.entry_b, duel.points_b]] as const) {
        if (!e || p === null) continue
        const r = ensure(e)
        if (p === 3) r.w++
        else if (p === 1) r.d++
        else r.l++
      }
    }
    for (const r of rows.values()) r.pts = duelPoints.get(r.entry) ?? r.w * 3 + r.d
    return [...rows.values()].sort((a, b) => b.pts - a.pts || b.w - a.w)
  }, [duels, duelPoints])

  const name = (e: string | null) => (e ? entryNames.get(e) ?? 'Unknown' : 'Bye')
  const person = (e: string | null): AvatarPerson | null => (e ? entryPeople.get(e) ?? null : null)
  /** Running points for an entry in the matchweek being played. */
  const live = (e: string | null) => (e ? livePoints.get(e) ?? 0 : 0)

  /**
   * Every other duel in the live matchweek — the rest of the card.
   *
   * The mode is personal, but the pool is not: five duels resolve on the same
   * ten fixtures, and knowing Tommy and Aisha are level makes the afternoon
   * bigger than your own game. Only the matchweek being played, because every
   * later one is sealed and the rows are not here to show.
   */
  const elsewhere = useMemo(() => {
    if (inPlayMatchweek === null) return []
    // `livePoints.get` inline rather than the `live` helper above: that helper
    // is a fresh closure every render, and reaching for it here is what made
    // the React Compiler bail out of memoising this list.
    return duels
      .filter((d) => d.matchweek_number === inPlayMatchweek && d.entry_b !== null)
      .filter((d) => !own.has(d.entry_a) && !own.has(d.entry_b as string))
      .map((d) => ({
        id: d.duel_id,
        a: d.entry_a, b: d.entry_b as string,
        pa: livePoints.get(d.entry_a) ?? 0,
        pb: livePoints.get(d.entry_b as string) ?? 0,
      }))
  }, [duels, inPlayMatchweek, own, livePoints])
  /**
   * The viewer, for the sealed card — which has no duel row to read from.
   *
   * `youMeta` mirrors the mockup's "2ND · 9 PTS": the rank and duel points the
   * member carries INTO the sealed week, so the card says something about them
   * even while it says nothing about the opponent.
   */
  const youEntry = ownEntryIds[0] ?? null
  const youPerson = person(youEntry)
  const youMeta = useMemo(() => {
    if (!youEntry) return null
    const t = totals.get(youEntry)
    const bits: string[] = []
    if (t?.rank) bits.push(`${ordinal(t.rank)}`)
    bits.push(`${duelPoints.get(youEntry) ?? 0} pts`)
    return bits.join(' \u00b7 ').toUpperCase()
  }, [youEntry, totals, duelPoints])

  /**
   * Fixtures in the live matchweek with no score row yet.
   *
   * Derived from the BEST-covered entry rather than a fixture count, because
   * this component is never given the fixtures. Everyone in a pool is scored on
   * the same list, so the entry with the most rows has seen everything that has
   * been played — and a matchweek is ten fixtures in every league we run.
   */
  /**
   * The fixture-by-fixture breakdown of the live duel.
   *
   * Only the matchweek being played — every later one is sealed and has no
   * score rows to break down. Ordered by fixture number, which is the order the
   * score rows are keyed on, NOT kickoff order: `fixture_number` is a stable
   * identifier and a matchweek's games are not played in it.
   */
  /**
   * Fixtures in the live matchweek with no score row yet.
   *
   * Counted from the real fixture list. It used to be
   * `10 - (rows the best-covered entry has)`, which assumed every league plays
   * ten a matchweek — true of the Premier League and wrong for a division of
   * eighteen, and only ever used to write "1 game still to play".
   */
  const remainingFixturesRaw = useMemo(() => {
    if (inPlayMatchweek === null || fixtures.length === 0) return null
    const scored = new Set<number>()
    for (const byFixture of perFixture.values()) {
      for (const n of byFixture.keys()) scored.add(n)
    }
    return fixtures.filter((f) => !scored.has(f.number)).length
  }, [inPlayMatchweek, fixtures, perFixture])

  /**
   * One member's pick for one fixture, as a short label.
   *
   * Depth-agnostic on purpose, the same way the duel engine is: a Results pool
   * has a tap in `outcomes`, a Scores pool has a scoreline in `predictions`, and
   * this reads whichever is present rather than being told which mode it is in.
   * Null means not revealed (or never picked) — and those are deliberately the
   * same to this component, because it must not be able to tell them apart.
   */
  const pickLabel = useMemo(() => {
    const taps = new Map<string, string>()
    for (const o of leagueOutcomes) {
      taps.set(`${o.entry_id}:${o.match_id}`, o.outcome === 'home' ? 'HOME' : o.outcome === 'away' ? 'AWAY' : 'DRAW')
    }
    for (const p of allPredictions) {
      const k = `${p.entry_id}:${p.match_id}`
      if (!taps.has(k)) taps.set(k, `${p.predicted_home_score}-${p.predicted_away_score}`)
    }
    return (entryId: string, fixtureId: string) => taps.get(`${entryId}:${fixtureId}`) ?? null
  }, [leagueOutcomes, allPredictions])

  /**
   * Is a match being played AT THIS MOMENT — as opposed to the matchweek merely
   * being in progress?
   *
   * ⚠ They are different states and the difference is the whole reason the dot
   * only pulses sometimes. Matchweek 2 is "in progress" from Friday's kickoff
   * until Monday night, but for most of that window no ball is in play. A dot
   * pulsing through Sunday morning would be claiming something untrue, and the
   * one on Saturday at 3pm would mean nothing because it never stops.
   */
  const anyFixtureLive = useMemo(
    () => fixtures.some((f) => getLiveClock({
      status: f.status, livePeriod: f.livePeriod,
      liveMinute: f.liveMinute, liveAdded: f.liveAdded,
    }) !== null),
    [fixtures],
  )

  const breakdown = useMemo(() => {
    if (!inPlay || !inPlay.them || inPlayMatchweek === null) return []
    const mine = perFixture.get(inPlay.you.entry) ?? new Map<number, number>()
    const theirs = perFixture.get(inPlay.them.entry) ?? new Map<number, number>()
    return fixtures.map((f) => {
      // A fixture is SCORED when a row exists for it, not when the clock says
      // it is over: the engine writes the row, and until it does there is
      // nothing to compare. Absent ≠ nil-nil.
      const scored = mine.has(f.number) || theirs.has(f.number)
      const mineP = mine.get(f.number) ?? 0
      const theirsP = theirs.get(f.number) ?? 0
      const myPick = pickLabel(inPlay.you.entry, f.id)
      const theirPick = inPlay.them ? pickLabel(inPlay.them.entry, f.id) : null
      /**
       * Who took THIS fixture. Named for the fixture, not for the viewer.
       *
       * ⚠ IT WAS 'won' | 'lost' AND THAT WAS WRONG. The opponent's chip flipped
       * the viewer's value, so `lost` — which also means "two different picks,
       * NEITHER scored" — inverted into a tick on their side. Liverpool v
       * Nott'm Forest was 0-0 to both and rendered as Sarah taking it.
       *
       * `neither` is therefore a state in its own right, and no chip flips
       * anything: each one asks whether it is the winner.
       */
      const outcome: 'same' | 'you' | 'them' | 'neither' | 'pending' =
        !scored ? 'pending'
          : myPick !== null && theirPick !== null && myPick === theirPick ? 'same'
            : mineP > theirsP ? 'you'
              : theirsP > mineP ? 'them'
                : 'neither'
      return {
        n: f.number,
        id: f.id,
        homeName: f.homeName,
        awayName: f.awayName,
        homeAbbr: f.homeAbbr,
        awayAbbr: f.awayAbbr,
        homeCrest: f.homeCrest,
        awayCrest: f.awayCrest,
        homeScore: f.homeScore,
        awayScore: f.awayScore,
        /**
         * Who won the MATCH — a different question from who took the fixture
         * in the duel. Both members can lose a game City won; that is the
         * "different picks, neither scored" row, and seeing 2-2 beside it is
         * what makes the tick pattern legible instead of arbitrary.
         */
        result:
          f.homeScore === null || f.awayScore === null ? null
            : f.homeScore > f.awayScore ? 'home'
              : f.awayScore > f.homeScore ? 'away' : 'draw',
        outcome,
        scored,
        mine: mineP,
        theirs: theirsP,
        myPick,
        theirPick,
        clock: getLiveClock({
          status: f.status, livePeriod: f.livePeriod,
          liveMinute: f.liveMinute, liveAdded: f.liveAdded,
        }),
        kickoffAt: f.kickoffAt,
      }
    })
  }, [inPlay, inPlayMatchweek, perFixture, fixtures, pickLabel])

  /**
   * Is the live duel already decided?
   *
   * A fixture is worth at most `maxPerFixture` — taken from what has actually
   * been paid out rather than assumed, because Results and Scores depths price
   * differently and this component is never told which it is sitting over. If
   * the lead is bigger than everything still to come, it is over: a knockout,
   * called while the last game is still to be played.
   */
  /** True once the gate has released at least one of the two sides' picks. */
  const anyPicksRevealed = useMemo(
    () => breakdown.some((b) => b.myPick !== null || b.theirPick !== null),
    [breakdown],
  )

  /**
   * "Six of ten are dead heat — this duel is Brighton, Palace and the Sunday
   * game." Null until the sheet is actually revealed.
   */
  const sheetSummary = useMemo(() => {
    if (!anyPicksRevealed) return null
    const differ = breakdown.filter((b) => b.myPick && b.theirPick && b.myPick !== b.theirPick)
    const same = breakdown.length - differ.length
    if (differ.length === 0) return `Identical sheets — all ${breakdown.length} picks the same.`
    const names = differ.slice(0, 3).map((d) => d.homeName)
    const tail = differ.length > 3 ? ` and ${differ.length - 3} more` : ''
    return `${same} of ${breakdown.length} are dead heat. This duel is ${names.join(', ')}${tail}.`
  }, [breakdown, anyPicksRevealed])

  const verdict = useMemo(() => {
    if (!inPlay || !inPlay.them || breakdown.length === 0 || remainingFixturesRaw === null) return null
    const you = livePoints.get(inPlay.you.entry) ?? 0
    const them = livePoints.get(inPlay.them.entry) ?? 0
    const maxPerFixture = Math.max(...breakdown.map((b) => Math.max(b.mine, b.theirs)), 0)
    if (maxPerFixture === 0) return null
    const stillAvailable = remainingFixturesRaw * maxPerFixture
    const lead = Math.abs(you - them)
    if (lead > stillAvailable) {
      return { safe: true, leader: you > them ? 'you' : 'them' as const, lead }
    }
    // The games that can still change it — the honest "what decides this".
    return { safe: false, leader: null, lead, deciders: remainingFixturesRaw }
  }, [inPlay, breakdown, livePoints, remainingFixturesRaw])

  const remainingFixtures = remainingFixturesRaw

  if (duels.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="arrow.triangle.merge" size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-600 font-medium">No duels yet</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
            The draw is made once there are two members, and your first opponent opens with the
            matchweek. Invite someone and it appears.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Being played now, then the one you are still picking. Both, because
          they are different weeks all weekend. */}
      {inPlay && (
        <DuelPanel
          m={inPlay} state="playing" name={name} person={person}
          live={{ you: live(inPlay.you.entry), them: live(inPlay.them?.entry ?? null) }}
          remaining={remainingFixtures}
          liveNow={anyFixtureLive}
          strip={breakdown.map((b) => b.outcome)}
        />
      )}
      {open && (
        <DuelPanel m={open} state="picking" name={name} person={person}
          live={null} remaining={null} liveNow={false} strip={[]} />
      )}

      {/* WHAT IS COMING, WITHOUT SAYING WHO.
          ⚠ ONLY BETWEEN ROUNDS. While a matchweek is being played this card is
          hidden entirely — Ryan, 2026-08-30: it pulls attention off the duel
          that is actually happening. `inPlayMatchweek === null` is exactly
          "no matchweek is in play", so the card appears when the last one
          settles and disappears when the next one kicks off.

          ⚠ NO COUNTDOWN, and the mockup had one. That was drawn under the
          open-for-picks rule, where a duel opened at a known instant. Migration
          119 opens it when the PREVIOUS MATCHWEEK IS DECIDED, and there is no
          timestamp for "when the last game is played and scored" — a clock here
          would be counting to a number we invented. The gold line carries the
          same weight and says the true thing instead. */}
      {inPlayMatchweek === null && sealedMatchweek !== null && (
        <div className="rounded-card overflow-hidden bg-midnight relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'linear-gradient(105deg,' +
                ' color-mix(in srgb, var(--primary-500) 22%, transparent) 0%,' +
                ' transparent 52%, color-mix(in srgb, var(--sp-slate) 14%, transparent) 100%)',
            }}
          />
          <div className="relative px-5 pt-4 pb-5">
            <p className="t-caption text-white/45 text-center mb-4">
              Matchweek {sealedMatchweek}
              <span className="ml-1.5 text-white/30">Opponent sealed</span>
            </p>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 max-w-lg mx-auto">
              <div className="min-w-0 flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-full shrink-0"
                  style={{ boxShadow: '0 0 0 3px color-mix(in srgb, var(--primary-500) 45%, transparent)' }}
                >
                  {youPerson
                    ? <Avatar person={youPerson} size={44} />
                    : <div className="w-11 h-11 rounded-full bg-white/10" aria-hidden="true" />}
                </div>
                <div className="min-w-0">
                  <p className="t-display text-xl text-white truncate">You</p>
                  {youMeta && <p className="t-num t-num-medium text-xs text-white/45 mt-0.5">{youMeta}</p>}
                </div>
              </div>

              <span className="t-display text-xl text-accent-400 select-none">V</span>

              <div className="min-w-0 flex items-center gap-3 justify-end">
                <div className="min-w-0 text-right">
                  {/* Redacted, not blank — withheld reads differently from missing. */}
                  <div className="h-5 w-24 ml-auto rounded bg-white/10" aria-hidden="true" />
                  <p className="t-detail text-white/35 uppercase tracking-widest mt-1.5">Sealed</p>
                  <span className="sr-only">Opponent not yet revealed</span>
                </div>
                <div className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center
                                border border-dashed border-white/25 t-display text-lg text-white/35">
                  ?
                </div>
              </div>
            </div>

            {/* The mockup's hero line. A state, not a clock. */}
            <p className="t-display text-2xl text-accent-400 text-center mt-5">
              {sealedOpensAfter !== null
                ? `Opens when matchweek ${sealedOpensAfter} is decided`
                : 'Opens when the current duel is decided'}
            </p>
            {/* The secondary line — the only clock in the rule.
                ⚠ AN UPPER BOUND, NOT A DUE TIME. The duel almost always opens
                well before this, the moment the previous matchweek is decided;
                this is the backstop migration 120 added so a postponement
                cannot push the reveal past the deadline. Labelled "at the
                latest" for that reason — a bare countdown would read as a
                promise about when, and it is a promise about no later than. */}
            <div className="mt-3 pt-3 border-t border-white/10 text-center">
              <p className="t-detail text-white/40">
                Or a day before you pick, whichever comes first.
              </p>
              {sealedOpensAtLatest && (
                <p className="t-num t-num-medium text-xs text-white/55 mt-1.5">
                  <Countdown to={sealedOpensAtLatest} /> at the latest
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* THE TALE OF THE TAPE — the two of you, measured against each other.
          Every row is a comparison, so the winning side is bolded rather than
          labelled: the shape of the card is the comparison. */}
      {inPlay?.them && (
        <Card padding="none" className="overflow-hidden">
          <p className="t-caption text-muted px-4 pt-4 pb-3">Tale of the tape</p>
          <TapeRow label="Season points"
            you={totals.get(inPlay.you.entry)?.totalPoints ?? 0}
            them={totals.get(inPlay.them.entry)?.totalPoints ?? 0} />
          <TapeRow label="Correct picks"
            you={totals.get(inPlay.you.entry)?.correct ?? 0}
            them={totals.get(inPlay.them.entry)?.correct ?? 0} />
          <TapeRow label="Table" lowerIsBetter
            you={totals.get(inPlay.you.entry)?.rank ?? null}
            them={totals.get(inPlay.them.entry)?.rank ?? null} />
          <TapeRow label="Duel points"
            you={duelPoints.get(inPlay.you.entry) ?? 0}
            them={duelPoints.get(inPlay.them.entry) ?? 0} />
          {form && (
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 border-t border-border-default">
              <FormDots types={form.get(inPlay.you.entry) ?? []} />
              <span className="t-detail text-muted uppercase tracking-widest">Form</span>
              <FormDots types={form.get(inPlay.them.entry) ?? []} align="right" />
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 border-t border-border-default">
            {(() => {
              const h2h = headToHead(duels, inPlay.you.entry, inPlay.them.entry)
              const met = h2h.won + h2h.drawn + h2h.lost
              return (
                <>
                  {/* Two zeroes under "first meeting" is noise pretending to be
                      data — there is no record yet, so the row says so and
                      shows nothing on either side. */}
                  <span className={met === 0
                    ? 't-num t-num-medium text-sm text-muted/40'
                    : 't-num t-num-extrabold text-sm text-ink'}>
                    {met === 0 ? '\u2014' : h2h.won}
                  </span>
                  <span className="t-detail text-muted uppercase tracking-widest whitespace-nowrap">
                    {met === 0 ? 'First meeting' : `Met ${met}\u00d7 \u00b7 W\u2013D\u2013L`}
                  </span>
                  <span className={`text-right ${met === 0
                    ? 't-num t-num-medium text-sm text-muted/40'
                    : 't-num t-num-extrabold text-sm text-ink'}`}>
                    {met === 0 ? '\u2014' : h2h.lost}
                  </span>
                </>
              )
            })()}
          </div>
        </Card>
      )}

      {/* THE TEAM SHEET — both sides' picks, fixture by fixture.
          ⚠ The opponent's column is REVEAL-GATED. `leagueOutcomes` and
          `allPredictions` come from the bulk route, which withholds a matchweek
          that is still open for picks; before lock there is simply nothing to
          render on their side. Nothing here may reconstruct a pick from
          another source. */}
      {inPlay?.them && breakdown.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.75rem_1fr_4.75rem] items-center gap-3 sm:gap-5 px-3 sm:px-5 pt-5 pb-3.5">
            <span className="t-caption text-primary-600">You</span>
            <span className="t-caption text-muted text-center">{breakdown.length} fixtures</span>
            <span className="t-caption text-danger-600 text-right truncate">{name(inPlay.them.entry)}</span>
          </div>

          <ul>
            {breakdown.map((b) => (
              <li key={b.n}
                className={`grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.75rem_1fr_4.75rem] items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3.5 border-t border-border-default
                  ${b.outcome === 'pending' ? 'bg-primary-50/40 dark:bg-primary-900/10 py-4' : ''}`}>
                <PickChip label={b.myPick} side="you" outcome={b.outcome} />

                {/* [name][crest] v [crest][name] — mirrored about the v, so the
                    two clubs carry the same weight and the eye lands in the
                    middle rather than reading left to right. */}
                {/* ⚠ A COLUMN, not an inline span with block children. The
                    kickoff line sat 2px under the crests on a `mt-0.5`, which
                    is not technically an overlap and reads as one — the crests
                    are 24px and the text baseline lands right on them. A real
                    flex column with a gap is the fix; the spacing is then a
                    property of the container rather than a margin guess. */}
                <span className="min-w-0 flex flex-col gap-2">
                  <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 sm:gap-4">
                    {/* ⚠ ABBREVIATION ON A PHONE, NAME ABOVE IT. Adding the
                        crests cost the width that made the names fit: at 375px
                        six of ten truncated, including "Crystal Palace" and
                        "Man United". A crest beside "CRY" is unambiguous where a
                        clipped "Crystal Pal…" is just worse — and it is what a
                        broadcast scoreboard does at this size. */}
                    {/* ⚠ THE WINNING CLUB IS LIT, THE LOSER IS DIMMED — the
                        score alone makes you read two digits and compare them.
                        A draw dims neither. This is about the MATCH, and is a
                        different question from who took the fixture in the
                        duel: both members can lose a game City won. */}
                    <span className={`flex items-center justify-end gap-2.5 min-w-0
                      ${b.result === 'home' ? 'opacity-100' : b.result ? 'opacity-60 md:opacity-45' : ''}`}>
                      {/* ⚠ THE CREST IS THE ONLY LABEL ON A PHONE, so the name
                          still has to reach a screen reader — sr-only, not
                          removed. A crest with no accessible name is an
                          unlabelled image where the content is. */}
                      <span className="sr-only">{b.homeName}</span>
                      <span className={`t-body truncate hidden md:inline ${b.result === 'home' ? 'text-ink font-bold' : 'text-muted'}`}>{b.homeName}</span>
                      <Crest url={b.homeCrest} name={b.homeName} />
                    </span>

                    {/* The score lives where the v was, which is what makes it
                        affordable on a phone: it replaces a separator rather
                        than adding a column. */}
                    {b.homeScore !== null && b.awayScore !== null ? (
                      <Scoreline left={b.homeScore} right={b.awayScore} live={!!b.clock} />
                    ) : (
                      <span className="t-detail text-muted/40">v</span>
                    )}

                    <span className={`flex items-center gap-2.5 min-w-0
                      ${b.result === 'away' ? 'opacity-100' : b.result ? 'opacity-60 md:opacity-45' : ''}`}>
                      <Crest url={b.awayCrest} name={b.awayName} />
                      <span className="sr-only">{b.awayName}</span>
                      <span className={`t-body truncate hidden md:inline ${b.result === 'away' ? 'text-ink font-bold' : 'text-muted'}`}>{b.awayName}</span>
                    </span>
                  </span>
                  {b.outcome === 'pending' && (
                    <span className="flex justify-center">
                      {/* A pill, so it reads as metadata about the fixture
                          rather than a second line of the fixture itself. A
                          live clock is red and ticking; a kickoff is blue and
                          quiet. */}
                      <span className={`t-detail uppercase tracking-wider rounded-full px-2.5 py-1
                        ${b.clock ? 'bg-danger-500/15 text-danger-600' : 'bg-primary-500/12 text-primary-600'}`}>
                        {b.clock ?? <LocalTime iso={b.kickoffAt} format={formatKickoff} />}
                      </span>
                    </span>
                  )}
                </span>

                <PickChip label={b.theirPick} side="them" outcome={b.outcome} align="right" />
              </li>
            ))}
          </ul>

          {/* What the sheet MEANS, in a sentence. Agreements cannot separate two
              members by definition, so the duel is only ever the divergences —
              which is both the honest reading and the interesting one. */}
          <div className="px-3 sm:px-5 py-4 border-t border-border-default">
            {sheetSummary && <p className="t-body text-muted mb-1.5">{sheetSummary}</p>}
            {verdict && (
              <p className="t-body text-muted">
                {verdict.safe ? (
                  <>
                    <b className="text-ink">
                      {verdict.leader === 'you' ? 'Mathematically safe.' : 'Mathematically out of reach.'}
                    </b>{' '}
                    {verdict.leader === 'you'
                      ? `A ${verdict.lead}-point lead with nothing left that can close it.`
                      : `Behind by ${verdict.lead}, with less than that still to play for.`}
                  </>
                ) : verdict.deciders ? (
                  <>
                    <b className="text-ink">
                      {verdict.lead === 0 ? 'Level.' : `${verdict.lead} points in it.`}
                    </b>{' '}
                    {verdict.deciders === 1
                      ? 'One game left, and it decides the duel.'
                      : `${verdict.deciders} games left, and they decide the duel.`}
                  </>
                ) : (
                  <><b className="text-ink">All games played.</b> Waiting on the matchweek to settle.</>
                )}
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Picks are withheld until the matchweek locks — say so, rather than
          rendering an empty sheet that reads as "nobody picked". */}
      {inPlay?.them && breakdown.length > 0 && !anyPicksRevealed && bulkState === 'ready' && (
        <Card padding="md">
          <p className="t-body text-muted text-center">
            Both team sheets open when matchweek {inPlayMatchweek} locks. Until then nobody can
            see anybody else&rsquo;s picks — including you.
          </p>
        </Card>
      )}

      {/* THE REST OF THE CARD. Showdown is personal, but the pool is not —
          five duels resolve on the same ten fixtures, and two members sitting
          level makes the afternoon bigger than your own game.

          Deliberately the SAME shape as the team sheet above it: two sides
          mirrored about a centred score. Two cards on one screen that both
          compare two things should not be read two different ways. */}
      {elsewhere.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <p className="t-caption text-muted px-4 sm:px-5 pt-5 pb-3.5">
            Elsewhere on the card
            <span className="ml-1.5 text-muted/60 normal-case tracking-normal">
              Matchweek {inPlayMatchweek}
            </span>
          </p>
          <ul>
            {elsewhere.map((d) => {
              const lead = d.pa === d.pb ? null : d.pa > d.pb ? 'a' : 'b'
              return (
                <li key={d.id} className="border-t border-border-default px-4 sm:px-5 py-3">
                  {/* ⚠ NO max-width. Capping this at max-w-lg centred the whole
                      row and left dead space at both ends of the card while the
                      two members huddled around the score. They belong at the
                      card's edges, with the score in the middle. */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-5">
                    <DuelSide
                      name={name(d.a)} person={person(d.a)}
                      leading={lead === 'a'} dimmed={lead === 'b'}
                    />
                    {/* ⚠ THE DASH IS THE AXIS, not the middle of the string.
                        An `auto` column sized itself per row, so "400-0" and
                        "300-400" centred at different widths and the digits
                        wandered down the card. Fixed width, home right-aligned,
                        away left-aligned: the dash lands in the same pixel on
                        every row and the numbers grow outwards from it. */}
                    <Scoreline left={d.pa} right={d.pb} />
                    <DuelSide
                      name={name(d.b)} person={person(d.b)}
                      leading={lead === 'b'} dimmed={lead === 'a'} align="right"
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* Record — AFTER the three duel cards, not between them. Playing, picking
          and sealed are one timeline and a stats block in the middle breaks it. */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-5">
            <Stat label="Won" value={record.won} />
            <Stat label="Tied" value={record.drawn} />
            <Stat label="Lost" value={record.lost} />
            {record.byes > 0 && <Stat label="Byes" value={record.byes} />}
          </div>
          <div className="text-right">
            <p className="t-num t-num-black text-3xl text-ink">{record.won * 3 + record.drawn}</p>
            <p className="t-detail text-muted mt-0.5">duel points</p>
          </div>
        </div>
      </Card>

      {/* The duel table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-3 pr-1 text-left font-bold w-8">#</th>
                <th className="py-2.5 px-2 text-left font-bold">Member</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">W</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">T</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">L</th>
                <th className="py-2.5 pl-2 pr-3 text-right font-bold w-11">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => (
                <tr
                  key={r.entry}
                  className={`border-t border-border-default ${own.has(r.entry) ? 'bg-primary-50/40' : ''}`}
                >
                  <td className="py-2 pl-3 pr-1 font-bold text-neutral-900">{i + 1}</td>
                  <td className="py-2 px-2 font-semibold text-neutral-900 truncate">{name(r.entry)}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.w}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.d}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.l}</td>
                  <td className="py-2 pl-2 pr-3 text-right font-bold text-neutral-900">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-neutral-400">
        The draw is made when the pool is created and rotates, so everybody meets everybody —
        but it opens one matchweek at a time. It changes only when someone joins or leaves, and
        never for a matchweek that has already opened.
      </p>
    </div>
  )
}

/**
 * One duel, with the week it belongs to and what is happening in it.
 *
 * Rendered for the in-play week and the open week both, so the heading has to
 * carry which is which — without it the two cards are identical and the member
 * cannot tell the games being played from the games they are still picking.
 */
function DuelPanel({
  m, state, name, person, live, remaining, liveNow, strip,
}: {
  m: { duel: DuelRow; you: Side; them: Side | null; matchweek: number }
  state: 'playing' | 'picking'
  name: (e: string | null) => string
  person: (e: string | null) => AvatarPerson | null
  /** Running score, or null before anything has been scored. */
  live: { you: number; them: number } | null
  /** Fixtures in this matchweek with no score row yet. */
  remaining: number | null
  /** A ball is in play RIGHT NOW — not merely "the matchweek is in progress". */
  liveNow: boolean
  /** Per-fixture outcome, in fixture order. Empty before anything is revealed. */
  strip: Array<'you' | 'them' | 'same' | 'neither' | 'pending'>
}) {
  const decided = m.duel.settled_at && m.them
  return (
    <div className="rounded-card overflow-hidden bg-midnight relative">
      {/* Blue corner bleeding in from the left, red from the right. The two
          brand tokens used as sides — the same pair every other screen reads as
          primary and danger, which is why the card needs no legend. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(105deg,' +
            ' color-mix(in srgb, var(--primary-500) 30%, transparent) 0%,' +
            ' transparent 44%, transparent 56%,' +
            ' color-mix(in srgb, var(--danger-500) 32%, transparent) 100%)',
        }}
      />
      <div className="relative px-5 pt-6 pb-7 sm:pt-7 sm:pb-8">
        <div className="flex items-center justify-center gap-2.5 mb-7">
          {/* ⚠ THE DOT IS THE INDICATOR, so it appears ONLY when a ball is in
              play — and the words that used to sit beside it are gone. A grey
              dot with no label says nothing, and "Being played" was saying what
              the red one already says. No dot means no game on right now, which
              the "1 game still to play" line under the score already covers. */}
          {liveNow && (
            <span className="relative flex w-2.5 h-2.5 shrink-0">
              <span className="absolute inline-flex w-full h-full rounded-full bg-danger-500 opacity-75
                               animate-ping motion-reduce:hidden" aria-hidden="true" />
              <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-danger-500" aria-hidden="true" />
              <span className="sr-only">Live</span>
            </span>
          )}
          <p className="t-caption text-sm text-white/75">
            Matchweek {m.matchweek}
            {/* Kept for the PICKING card only: the dot does not cover this, and
                without it nothing says why that week is on screen. */}
            {state === 'picking' && (
              <span className="ml-2 text-xs text-white/35">You are picking this one</span>
            )}
          </p>
        </div>

        {/* ⚠ THE CAP LIFTS ON DESKTOP. max-w-lg keeps the two corners readable
            on a phone; on a wide card it parked them in the middle with dead
            space at both ends. Same fix as "elsewhere on the card". */}
        {m.them ? (
          <>
            {/* ⚠ AVATARS IN LINE WITH THE SCORE, NAMES ON THEIR OWN ROW.
                The avatars stay at the card's edges above their own names, as
                they were. What moved is the NAME: sharing a row with a 48px
                scoreline left it about a quarter of the card, and "IZZETmagic"
                truncated to "IZZET…" at every size we tried. On its own row it
                gets half the card — more than any name needs — so the fix is
                layout rather than smaller type, and the names got BIGGER as a
                result instead of smaller. */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
              <span className="flex justify-start">
                <AvatarRing side="blue" person={person(m.you.entry)} />
              </span>
              {live !== null ? (
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="t-display text-4xl sm:text-5xl text-primary-400">{live.you}</span>
                  <span className="t-display text-xl sm:text-2xl text-white/30">&ndash;</span>
                  <span className="t-display text-4xl sm:text-5xl text-danger-400">{live.them}</span>
                </div>
              ) : (
                <span className="t-display text-2xl sm:text-3xl text-accent-400 select-none">V</span>
              )}
              <span className="flex justify-end">
                <AvatarRing side="red" person={person(m.them.entry)} />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-5">
              <p className="t-display text-xl sm:text-3xl text-white truncate">{name(m.you.entry)}</p>
              <p className="t-display text-xl sm:text-3xl text-white truncate text-right">{name(m.them.entry)}</p>
            </div>
          </>
        ) : (
          <p className="t-body text-white/60 text-center max-w-sm mx-auto">
            You sit this one out. With an odd number of members somebody has a bye each
            week — it rotates, so everyone gets the same number.
          </p>
        )}

        {/* THE STRIP — one segment per fixture, in the order they are played.
            Blue you took it, red they took it, grey a dead heat neither could
            win, hollow still to come. It is the team sheet below compressed to
            a glance: you can see the SHAPE of the duel and how much is left.

            ⚠ Desktop only. The phone card is already right and this is width
            that only a wide card has going spare — it is not information the
            small screen is missing, it is the same information the sheet under
            it carries in full.

            ⚠ CAPPED AND CENTRED, so it lives under the SCORE rather than
            running the full width and passing beneath the avatars and names. It
            describes the contest in the middle of the card; stretched past the
            two people it read as a divider. */}
        {strip.length > 0 && (
          <div className="hidden md:flex items-stretch gap-1 mt-7 h-1.5 max-w-xs mx-auto w-full" aria-hidden="true">
            {strip.map((o, i) => (
              <span key={i} className={`flex-1 rounded-full ${
                o === 'you' ? 'bg-primary-500'
                  : o === 'them' ? 'bg-danger-500'
                    : o === 'same' || o === 'neither' ? 'bg-white/15'
                      : 'border border-dashed border-white/25'}`} />
            ))}
          </div>
        )}

        {!decided && live && m.them && (
          <p className="t-body text-white/70 text-center mt-6 pt-5 border-t border-white/10">
            {live.you === live.them
              ? 'Level'
              : `${live.you > live.them ? 'You lead' : 'Behind'} by ${Math.abs(live.you - live.them)}`}
            {remaining ? ` — ${remaining} ${remaining === 1 ? 'game' : 'games'} still to play` : ' — all games played'}
          </p>
        )}
        {decided && (
          <p className="t-caption text-sm text-center mt-6 pt-5 border-t border-white/10">
            <span className={m.you.points === 3 ? 'text-success-400'
              : m.you.points === 1 ? 'text-accent-400' : 'text-white/40'}>
              {m.you.points === 3 ? 'You won this duel — three points'
                : m.you.points === 1 ? 'A tie — one point each'
                : 'They took this one'}
            </span>
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * One side of a duel.
 *
 * ⚠ The initials are computed here rather than imported from
 * `lib/design/initials.ts`, and the circle is drawn here rather than using
 * `components/ui/Avatar`. Both exist, both are better, and both are uncommitted
 * work in progress — importing them would make this file fail to build for
 * anyone who has this commit and not that one. Swap when Avatars v1 lands; the
 * shape below is deliberately the same (circle, initials, size in px).
 */
function AvatarRing({
  side, person,
}: { side: 'blue' | 'red'; person: AvatarPerson | null }) {
  return (
    <div
      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0"
      style={{
        boxShadow: `0 0 0 3px color-mix(in srgb, var(--${side === 'blue' ? 'primary' : 'danger'}-500) 45%, transparent)`,
        borderRadius: '9999px',
      }}
    >
      {/* The shared circle — hashed gradient and initials, the same face this
          person wears in banter and on the pools list. A duel corner that
          invented its own colour would make one person look like two. */}
      {person
        ? <Avatar person={person} size={56} />
        : <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/10" aria-hidden="true" />}
    </div>
  )
}

/** One comparison row. The better side is bolded — the card IS the comparison. */
function TapeRow({
  label, you, them, lowerIsBetter = false,
}: { label: string; you: number | null; them: number | null; lowerIsBetter?: boolean }) {
  const better = you === null || them === null || you === them
    ? null
    : lowerIsBetter ? (you < them ? 'you' : 'them') : (you > them ? 'you' : 'them')
  const cell = (v: number | null, side: 'you' | 'them') =>
    `t-num ${better === side ? 't-num-extrabold text-ink' : 't-num-medium text-muted'} text-sm`
  const show = (v: number | null) => (v === null ? '\u2014' : v)
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 border-t border-border-default">
      <span className={cell(you, 'you')}>{show(you)}</span>
      <span className="t-detail text-muted uppercase tracking-widest whitespace-nowrap">{label}</span>
      <span className={`${cell(them, 'them')} text-right`}>{show(them)}</span>
    </div>
  )
}

/**
 * The leaderboard's form dots, at duel scale.
 *
 * Same `score_type` vocabulary the leaderboard reads, so a member sees the same
 * five results in both places rather than two different truths about a week.
 */
function FormDots({ types, align = 'left' }: { types: string[]; align?: 'left' | 'right' }) {
  if (types.length === 0) {
    return <span className={`t-detail text-muted/50 ${align === 'right' ? 'text-right block' : ''}`}>&mdash;</span>
  }
  return (
    <span className={`flex gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
      {types.map((t, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            t === 'miss' ? 'bg-danger-500'
              : t === 'none' ? 'bg-muted/30'
                : 'bg-primary-500'}`}
        />
      ))}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col">
      <span className="t-num t-num-extrabold text-xl text-ink">{value}</span>
      <span className="t-detail text-muted uppercase tracking-widest mt-0.5">{label}</span>
    </span>
  )
}
