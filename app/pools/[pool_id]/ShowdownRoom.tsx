'use client'

// =============================================================
// THE ROOM — every duel of a matchweek, and what each was decided on
// =============================================================
// The web half of the screen Ryan asked for on 2026-09-04: there was no way to
// see your own duel history, nor anybody else's, nor what everyone picked in a
// given week. All three are the same question asked about one MATCHWEEK, so the
// matchweek is the whole navigation — walk back through the weeks and every
// answer is already there.
//
// ## ⚠ THE SWITCHER STOPS AT WHAT HAS BEEN REVEALED — IN BOTH SENSES
//
// Migration 116 seals the draw in RLS and the pool page reads duels with the
// VIEWER's client, so a sealed week is not in the payload at all. That used to
// be the whole story.
//
// ⚠⚠ IT STOPPED BEING TRUE WHEN THE WALKOUT SHIPPED. There are now TWO reveals
// — 116 reveals a duel to the DATABASE, the ceremony reveals it to the MEMBER —
// and on the phone this screen only knew about the first. Between them the Room
// listed the new opponent's name while the band two tabs away read "Sealed ·
// Opponent hidden". So the bound is the revealed weeks MINUS
// `unwatchedMatchweek`, which comes from the one phase machine rather than
// being worked out here.
//
// ## ⚠ AN OPEN WEEK HAS NO RIVALS' PICKS, AND THAT IS NOT AN EMPTY WEEK
//
// `/bulk` withholds a matchweek that is still open for picks. So the current
// week's card lists its duels and its fixtures with nobody's picks beside them,
// and it has to say "not yet" rather than render blanks that read as "nobody
// picked". Nothing here may reconstruct a pick from another source.
//
// ## ⚠ NOTHING HERE SCORES ANYTHING
//
// Who took a fixture comes from `buildSheet`; the per-fixture points come from
// `/duel-live`. Both picks and the final score are already on the client, so it
// is tempting to work out who was right here — that is exactly the client-side
// scoring the architecture rule forbids, and at Scores depth it would have to
// reimplement the exact/result tiers to get it wrong quietly.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { avatarInk, type AvatarInk } from '@/lib/design/avatarGradient'
import type { AvatarPerson } from '@/components/ui/Avatar'
import { buildSheet, sheetSummary, type SheetFixture, type SheetLive } from '@/lib/league/duelSheet'
import { duelResult } from '@/lib/league/duelPoints'
import type { DuelRow } from '@/lib/league/duels'
import { matchweekFixtures, type SeasonMatch } from '@/lib/league/matchweekFixtures'
import { DuelSide, Scoreline, TeamSheetRows } from './TeamSheet'

type Props = {
  poolId: string
  /** Every duel the RLS policy released to this viewer — see the header. */
  duels: DuelRow[]
  entryNames: Map<string, string>
  entryPeople: Map<string, AvatarPerson>
  ownEntryIds: string[]
  /** The whole season's fixtures, already on the client for the Results tab. */
  matches: SeasonMatch[]
  /** Being played right now. Null between rounds. */
  inPlayMatchweek: number | null
  /**
   * A matchweek whose duel has opened in RLS but whose walkout this member has
   * not watched — withheld from the switcher until they have.
   *
   * ⚠ IT HIDES A WEEK, NOT A NAME. Blanking the opponent inside the row would
   * leave a duel that looks like a bye — and a bye is structural (`entry_b IS
   * NULL`), so faking one is a lie the rest of the code cannot see through.
   */
  unwatchedMatchweek: number | null
  /** Reveal-gated picks from `/bulk`. An open week is not in here at all. */
  leagueOutcomes: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
  allPredictions: Array<{ entry_id: string; match_id: string; predicted_home_score: number; predicted_away_score: number }>
  bulkState: 'idle' | 'loading' | 'ready' | 'error'
  /**
   * The IN-PLAY week's per-fixture points, kept fresh by `PoolDetail`.
   *
   * ⚠ HANDED IN RATHER THAN FETCHED, for that week only. `PoolDetail` already
   * polls `/duel-live` for it and folds migration 125's broadcast into it; a
   * second poller here would be a second answer to a moving number, and the
   * two would visibly disagree mid-afternoon.
   */
  livePerFixture: Map<string, Map<number, number>>
}

/** What `/duel-live` returns, for one week. */
type WeekPoints = {
  perFixture: Map<string, Map<number, number>>
  points: Map<string, number>
}

const EMPTY: WeekPoints = { perFixture: new Map(), points: new Map() }

export function ShowdownRoom({
  poolId, duels, entryNames, entryPeople, ownEntryIds, matches,
  inPlayMatchweek, unwatchedMatchweek, leagueOutcomes, allPredictions, bulkState,
  livePerFixture,
}: Props) {
  /**
   * Which weeks this member may look at.
   *
   * ⚠ DERIVED FROM THE DUELS THEMSELVES, not from the season. A week is here
   * because its rows survived migration 116's policy — the seal is enforced in
   * the database, and this list is the shape of what came back.
   */
  const revealedWeeks = useMemo(() => {
    const ws = new Set<number>()
    for (const d of duels) ws.add(d.matchweek_number)
    if (unwatchedMatchweek !== null) ws.delete(unwatchedMatchweek)
    return [...ws].sort((a, b) => a - b)
  }, [duels, unwatchedMatchweek])

  /**
   * Opens on the week being PLAYED — that is the one people are talking about
   * while they are talking about it.
   *
   * ⚠ IT FALLS BACK TO THE LATEST REVEALED WEEK, AND IT HAS TO.
   * `inPlayMatchweek` is null between matchweeks, which is most of any given
   * week. It is also CHECKED against `revealedWeeks` rather than trusted: a week
   * can be in play with its duels still sealed — or held back for an unwatched
   * walkout — and landing there would open the switcher on a matchweek with
   * nothing in it.
   *
   * ⚠ `week` STAYS NULL UNTIL AN ARROW IS PRESSED, so the default keeps
   * following the football as the payload loads. Seeding state from data would
   * pin it to whatever happened to be true on the first render.
   */
  const [week, setWeek] = useState<number | null>(null)
  const shown =
    week ??
    (inPlayMatchweek !== null && revealedWeeks.includes(inPlayMatchweek)
      ? inPlayMatchweek
      : revealedWeeks[revealedWeeks.length - 1] ?? null)

  const [openDuel, setOpenDuel] = useState<string | null>(null)

  /**
   * One member's pick for one fixture, as a short label.
   *
   * Depth-agnostic on purpose, the same way the duel engine is: a Results pool
   * has a tap in `outcomes`, a Scores pool has a scoreline in `predictions`, and
   * this reads whichever is present rather than being told which mode it is in.
   *
   * ⚠ NULL MEANS NOT REVEALED **OR** NEVER PICKED, and those are deliberately
   * indistinguishable — telling them apart is what the reveal gate exists to
   * prevent.
   */
  const pickLabel = useMemo(() => {
    const taps = new Map<string, string>()
    for (const o of leagueOutcomes) {
      taps.set(`${o.entry_id}:${o.match_id}`,
        o.outcome === 'home' ? 'HOME' : o.outcome === 'away' ? 'AWAY' : 'DRAW')
    }
    for (const p of allPredictions) {
      const k = `${p.entry_id}:${p.match_id}`
      if (!taps.has(k)) taps.set(k, `${p.predicted_home_score}-${p.predicted_away_score}`)
    }
    return (entryId: string, fixtureId: string) => taps.get(`${entryId}:${fixtureId}`) ?? null
  }, [leagueOutcomes, allPredictions])

  /**
   * The per-fixture points for whichever week is on screen.
   *
   * ⚠ FETCHED PER WEEK, AND CACHED — the switcher is the whole interaction, so
   * walking back through the season would otherwise refetch the same settled
   * week every time you passed it. A settled matchweek's points cannot change
   * without a rescore, so the cache has no staleness to manage.
   *
   * ⚠ AND NEVER FOR THE IN-PLAY WEEK, which arrives as a prop that `PoolDetail`
   * keeps moving. Fetching that one here would be a second, slower answer to a
   * number the page is already updating live, and the Room would sit a minute
   * behind the band.
   *
   * ⚠ `/duel-live` TAKES THE MATCHWEEK AS A PARAMETER and its own header says
   * why that is safe: the seal withholds who you are PLAYING, never what was
   * SCORED in a week already played.
   */
  const [cache, setCache] = useState<Map<number, WeekPoints>>(new Map())
  const inFlight = useRef<Set<number>>(new Set())

  useEffect(() => {
    if (shown === null || shown === inPlayMatchweek) return
    if (cache.has(shown) || inFlight.current.has(shown)) return
    inFlight.current.add(shown)
    let cancelled = false
    fetch(`/api/pools/${poolId}/duel-live?matchweek=${shown}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json: {
        points: Record<string, number>
        perFixture: Record<string, Record<string, number>>
      }) => {
        if (cancelled) return
        const perFixture = new Map(
          Object.entries(json.perFixture ?? {}).map(([entry, byFx]) => [
            entry, new Map(Object.entries(byFx).map(([n, p]) => [Number(n), p])),
          ]),
        )
        setCache((prev) => new Map(prev).set(shown, {
          perFixture, points: new Map(Object.entries(json.points ?? {})),
        }))
      })
      // ⚠ LOGGED, NOT SWALLOWED. A failed fetch leaves the week with no points,
      // which renders every fixture as unscored — a plausible-looking sheet for
      // a week that was played months ago. This is the only thing that would say
      // so.
      .catch((e) => console.error('[room] week points failed:', e))
      .finally(() => { inFlight.current.delete(shown) })
    return () => { cancelled = true }
  }, [poolId, shown, inPlayMatchweek, cache])

  const weekPoints: WeekPoints = shown === null
    ? EMPTY
    : shown === inPlayMatchweek
      ? { perFixture: livePerFixture, points: new Map() }
      : cache.get(shown) ?? EMPTY

  const fixtures = useMemo<SheetFixture[]>(
    () => (shown === null ? [] : matchweekFixtures(matches, shown).map((f) => ({
      number: f.number, id: f.id,
      homeName: f.homeName, awayName: f.awayName,
      homeAbbr: f.homeAbbr, awayAbbr: f.awayAbbr,
      homeCrest: f.homeCrest, awayCrest: f.awayCrest,
      kickoffAt: f.kickoffAt,
      homeScoreFt: f.homeScore, awayScoreFt: f.awayScore,
      isCompletedFt: f.isCompleted,
    }))),
    [matches, shown],
  )
  const live = useMemo<Map<number, SheetLive>>(
    () => (shown === null ? new Map() : new Map(matchweekFixtures(matches, shown).map((f) => [
      f.number,
      {
        homeScore: f.homeScore, awayScore: f.awayScore,
        status: f.status, isCompleted: f.isCompleted,
        liveMinute: f.liveMinute, livePeriod: f.livePeriod, liveAdded: f.liveAdded,
      },
    ]))),
    [matches, shown],
  )

  const weekDuels = useMemo(
    () => duels
      .filter((d) => d.matchweek_number === shown)
      .sort((a, b) => a.duel_id.localeCompare(b.duel_id)),
    [duels, shown],
  )

  /**
   * A member's colour, for the two pick columns.
   *
   * ⚠⚠ IT HASHES THE **USER** ID, NOT THE ENTRY ID. `avatarInk` takes a user id
   * — its parameter says so — and handed an entry id it returns a perfectly
   * valid colour for the wrong key. That is how a blue avatar ended up inside a
   * red ring on the band, and here it would be worse: the faces on the collapsed
   * row come from `entryPeople`, so a member's face and their own pick column
   * would be different colours three centimetres apart, on the one card whose
   * whole job is telling the two sides apart.
   *
   * ⚠ THE ENTRY ID IS THE FALLBACK, and only for an entry with no person behind
   * it — a stable arbitrary colour beats a shared default that would paint both
   * columns the same.
   */
  const inkFor = useCallback((entry: string | null): AvatarInk => {
    const p = entry ? entryPeople.get(entry) : null
    return avatarInk(p?.user_id ?? entry ?? '')
  }, [entryPeople])

  const own = useMemo(() => new Set(ownEntryIds), [ownEntryIds])
  const name = useCallback(
    (id: string | null) => (id === null ? 'Bye' : entryNames.get(id) ?? 'Unknown'),
    [entryNames],
  )

  if (shown === null) {
    /*
      ⚠ TWO REASONS FOR AN EMPTY ROOM, AND THEY ARE NOT THE SAME THING. A pool
      that has played nothing has nothing to show; a member holding an unwatched
      walkout has a week waiting behind a door they have not opened. Telling them
      "your first one appears here once it does" in the second case would be
      false, and would read as the feature being broken.
    */
    const waiting = unwatchedMatchweek !== null
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name={waiting ? 'lock.fill' : 'person.2.fill'}
                size={34} className="mx-auto text-neutral-300 mb-3" />
          <p className="t-body font-semibold text-ink">
            {waiting ? 'Your duel is waiting' : 'Nothing to show yet'}
          </p>
          <p className="t-detail text-muted mt-2 max-w-sm mx-auto">
            {waiting
              ? `Matchweek ${unwatchedMatchweek} opens here once you have met your opponent on the Duel tab.`
              : 'The room fills up as duels open. Your first one appears here once it does.'}
          </p>
        </div>
      </Card>
    )
  }

  const i = revealedWeeks.indexOf(shown)
  const canBack = i > 0
  const canForward = i >= 0 && i < revealedWeeks.length - 1

  return (
    <div className="space-y-4">
      {/* ⚠ BOUNDED BY `revealedWeeks`, NOT BY THE SEASON. Walking past the last
          revealed week would land on a matchweek whose duels the viewer is not
          allowed to see — the arrow is simply not enabled instead. */}
      <div className="flex items-center justify-between gap-3">
        <Step icon="chevron.left" label="Previous matchweek"
              enabled={canBack} onClick={() => { setWeek(revealedWeeks[i - 1]); setOpenDuel(null) }} />
        <p className="t-body font-bold text-ink">Matchweek {shown}</p>
        <Step icon="chevron.right" label="Next matchweek"
              enabled={canForward} onClick={() => { setWeek(revealedWeeks[i + 1]); setOpenDuel(null) }} />
      </div>

      {weekDuels.map((d) => (
        <DuelCard
          key={d.duel_id}
          duel={d}
          name={name}
          person={(e) => (e ? entryPeople.get(e) ?? null : null)}
          isYours={own.has(d.entry_a) || (d.entry_b !== null && own.has(d.entry_b))}
          open={openDuel === d.duel_id}
          onToggle={() => setOpenDuel(openDuel === d.duel_id ? null : d.duel_id)}
          fixtures={fixtures}
          live={live}
          inkFor={inkFor}
          perFixture={weekPoints.perFixture}
          points={weekPoints.points}
          pickLabel={pickLabel}
          bulkState={bulkState}
          matchweek={shown}
        />
      ))}
    </div>
  )
}

// -------------------------------------------------------------- one duel

function DuelCard({
  duel, name, person, isYours, open, onToggle,
  fixtures, live, inkFor, perFixture, points, pickLabel, bulkState, matchweek,
}: {
  duel: DuelRow
  name: (id: string | null) => string
  person: (id: string | null) => AvatarPerson | null
  inkFor: (entry: string | null) => AvatarInk
  isYours: boolean
  open: boolean
  onToggle: () => void
  fixtures: SheetFixture[]
  live: Map<number, SheetLive>
  perFixture: Map<string, Map<number, number>>
  points: Map<string, number>
  pickLabel: (entryId: string, fixtureId: string) => string | null
  bulkState: 'idle' | 'loading' | 'ready' | 'error'
  matchweek: number
}) {
  const settled = !!duel.settled_at
  // ⚠ `duelResult` FROM SIDE A'S COLUMN, never a literal — a win has been 500
  // since migration 121, and `headToHead` survived that sweep still comparing
  // against 3, which scored every meeting as a loss for everybody, silently.
  const aResult = settled && duel.entry_b ? duelResult(duel.points_a) : null

  /**
   * The week's points so far, for a duel that has not settled.
   *
   * ⚠ "NO ROWS YET" IS NOT "NIL". `readMatchweekPoints` omits an entry with no
   * score rows at all, so both being absent means the fixtures have not been
   * scored — which is a `v`, not a 0-0 claiming a week nobody has played. One
   * side present is enough: the other genuinely has nothing so far, and 0 is the
   * honest number for it.
   */
  const running = (() => {
    if (duel.entry_b === null) return { a: null, b: null }
    const a = points.get(duel.entry_a)
    const b = points.get(duel.entry_b)
    if (a === undefined && b === undefined) return { a: null, b: null }
    return { a: a ?? 0, b: b ?? 0 }
  })()

  /**
   * ⚠ A SETTLED DUEL READS ITS STORED ACCURACIES, not the live map. That is the
   * engine's own record of the week and it is what `duelResult` above was
   * computed from; preferring a recomputed number would let the card and the
   * result disagree after a rescore.
   */
  const left = settled ? duel.accuracy_a ?? 0 : running.a
  const right = settled ? duel.accuracy_b ?? 0 : running.b

  /**
   * Who to bold, and who to fade.
   *
   * ⚠ A SETTLED DUEL IS READ OFF THE POINTS COLUMN, NOT OFF THE SCORELINE.
   * `points_a` is what the engine paid and `duelResult` is what turns it back
   * into won/tied/lost; comparing the two accuracies again would be a second
   * opinion about a result that already has one, and the two would part company
   * the moment a rescore changed one without the other.
   *
   * Only an UNSETTLED duel has no verdict to read, and there the running
   * scoreline is all there is.
   */
  const lead: 'a' | 'b' | null = settled
    ? (aResult === 'won' ? 'a' : aResult === 'lost' ? 'b' : null)
    : left === null || right === null || left === right
      ? null
      : left > right ? 'a' : 'b'

  return (
    <Card padding="none" className={`overflow-hidden ${isYours ? 'ring-1 ring-primary-500/50' : ''}`}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-mist/50 transition-colors"
      >
        <div className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-3 sm:gap-5">
          <DuelSide name={name(duel.entry_a)} person={person(duel.entry_a)}
                    leading={lead === 'a'} dimmed={lead === 'b'} />
          {duel.entry_b === null ? (
            // ⚠ A BYE IS STRUCTURAL — `entry_b IS NULL` — and is never read off
            // the points. `DUEL_BYE === DUEL_TIE === 250`, so a value test calls
            // it a draw against an opponent who never existed.
            <span className="t-caption text-muted">bye</span>
          ) : (
            <Scoreline left={left} right={right} />
          )}
          <DuelSide name={name(duel.entry_b)} person={person(duel.entry_b)}
                    leading={lead === 'b'} dimmed={lead === 'a'} align="right" />
          <Icon name={open ? 'chevron.up' : 'chevron.down'} size={12}
                className="text-muted/60" />
        </div>
      </button>

      {open && (
        <Sheets
          duel={duel} name={name} fixtures={fixtures} live={live}
          inkFor={inkFor} perFixture={perFixture} pickLabel={pickLabel}
          bulkState={bulkState} matchweek={matchweek}
        />
      )}
    </Card>
  )
}

// ------------------------------------------------------------- the sheets

/**
 * Both members' picks, fixture by fixture.
 *
 * ⚠ WHERE THEY AGREE IS DEAD WEIGHT. A fixture both called the same way cannot
 * separate them whatever it finishes — so those chips go grey and the ones they
 * differ on stay lit. That is the reading this whole screen exists for, and it
 * is why the picks are worth showing side by side rather than as two lists.
 */
function Sheets({
  duel, name, fixtures, live, inkFor, perFixture, pickLabel, bulkState, matchweek,
}: {
  duel: DuelRow
  name: (id: string | null) => string
  fixtures: SheetFixture[]
  live: Map<number, SheetLive>
  inkFor: (entry: string | null) => AvatarInk
  perFixture: Map<string, Map<number, number>>
  pickLabel: (entryId: string, fixtureId: string) => string | null
  bulkState: 'idle' | 'loading' | 'ready' | 'error'
  matchweek: number
}) {
  const rows = useMemo(
    () => buildSheet({
      fixtures,
      live,
      mine: perFixture.get(duel.entry_a) ?? new Map<number, number>(),
      theirs: duel.entry_b ? perFixture.get(duel.entry_b) ?? new Map<number, number>() : new Map(),
      label: pickLabel,
      youEntry: duel.entry_a,
      themEntry: duel.entry_b,
    }),
    [fixtures, live, perFixture, pickLabel, duel.entry_a, duel.entry_b],
  )

  const summary = sheetSummary(rows)
  const anyPicks = rows.some((r) => r.myPick !== null || r.theirPick !== null)

  /**
   * ⚠ WHOSE COLUMN IS WHICH: `entry_a` left, `entry_b` right, matching the two
   * names in the header above AND the two faces on the row that opened this.
   * Orientation is presentational — the circle method's sides carry no meaning
   * — but the colours must agree with the people or the sheet is unreadable.
   */
  const aInk = inkFor(duel.entry_a)
  const bInk = inkFor(duel.entry_b)

  if (duel.entry_b === null) {
    return (
      <p className="t-body text-muted px-4 sm:px-5 pb-4 border-t border-border-default pt-4">
        {name(duel.entry_a)} sat this one out — nobody was drawn against them.
      </p>
    )
  }

  // ⚠ NO PICKS AT ALL MEANS THE MATCHWEEK HAS NOT LOCKED, not that nobody
  // picked — `/bulk` withholds an open week. Saying "not yet" is the only
  // honest reading; blanks would accuse both members of skipping it.
  //
  // ⚠ AND ONLY ONCE THE BULK READ HAS LANDED. While it is loading, "picks open
  // when the matchweek locks" would be stated about a week that locked in
  // August.
  if (!anyPicks) {
    return (
      <p className="t-body text-muted px-4 sm:px-5 pb-4 border-t border-border-default pt-4">
        {bulkState === 'ready'
          ? `Both team sheets open when matchweek ${matchweek} locks — an hour before the first kickoff.`
          : 'Loading picks…'}
      </p>
    )
  }

  return (
    <div className="border-t border-border-default">
      <div className="grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.75rem_1fr_4.75rem] items-center gap-3 sm:gap-5 px-3 sm:px-5 pt-4 pb-3">
        <span className="t-caption truncate text-[var(--chip-strong)] dark:text-[var(--chip-soft)]"
              style={{ '--chip-strong': aInk.strong, '--chip-soft': aInk.soft } as React.CSSProperties}>
          {name(duel.entry_a)}
        </span>
        <span className="t-caption text-muted text-center">{rows.length} fixtures</span>
        <span className="t-caption text-right truncate text-[var(--chip-strong)] dark:text-[var(--chip-soft)]"
              style={{ '--chip-strong': bInk.strong, '--chip-soft': bInk.soft } as React.CSSProperties}>
          {name(duel.entry_b)}
        </span>
      </div>

      {/* ⚠ THE SAME SHEET THE DUEL TAB SHOWS. The phone shipped a thinner
          version of this and it drifted the moment the Duel tab's row grew — a
          member switching between the two tabs is comparing them directly. */}
      <TeamSheetRows rows={rows} youInk={aInk} themInk={bInk} />

      {/* Agreement is dead weight by definition: a fixture both called the same
          way cannot separate them whatever it finishes. Saying how many is what
          makes the rest mean something. */}
      {summary && (
        <p className="t-body text-muted px-3 sm:px-5 py-4 border-t border-border-default">
          {summary}
        </p>
      )}
    </div>
  )
}

/**
 * One end of the matchweek switcher.
 *
 * Dimmed rather than removed, so the header does not reflow as you walk to
 * either end of the season.
 */
function Step({
  icon, label, enabled, onClick,
}: { icon: string; label: string; enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={enabled ? onClick : undefined}
      disabled={!enabled}
      aria-label={label}
      className={`w-9 h-9 rounded-pill grid place-items-center bg-mist text-muted transition-opacity
        ${enabled ? 'hover:text-ink active:opacity-60' : 'opacity-30 cursor-default'}`}
    >
      <Icon name={icon} size={14} weight="semibold" />
    </button>
  )
}
