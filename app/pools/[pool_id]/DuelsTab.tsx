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

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { headToHead, type DuelRow } from '@/lib/league/duels'

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
  liveScored: Map<string, number>
  /** entry_id → fixture_number → points, for the fixture-by-fixture breakdown. */
  perFixture: Map<string, Map<number, number>>
  /** fixture_number → "Chelsea v Brighton", for the live matchweek. */
  fixtureLabels: Map<number, string>
  /** Season totals per entry — points, rank, duel points. */
  totals: Map<string, { totalPoints: number; rank: number | null; duelPoints: number; correct: number }>
  /** Last five score types per entry, oldest first. Same source as the leaderboard's dots. */
  form?: Map<string, string[]>
  /** Duel points per entry, from the leaderboard read. */
  duelPoints: Map<string, number>
}

type Side = { entry: string; points: number | null; accuracy: number | null }

/**
 * ⚠ An assumption, and a shallow one: every league we run is ten fixtures a
 * matchweek. It is only used to say "1 game still to play", so being wrong
 * costs a sentence rather than a score — but a 18-club division would be nine,
 * and the honest fix is to pass the fixture count down from the league view.
 */
const FIXTURES_PER_MATCHWEEK = 10

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
  entryPeople,
  livePoints,
  liveScored,
  perFixture,
  fixtureLabels,
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
  /** Fixtures in the live matchweek with no score row yet. */
  const remainingFixturesRaw = useMemo(() => {
    if (inPlayMatchweek === null || liveScored.size === 0) return null
    const best = Math.max(...liveScored.values())
    return Math.max(0, FIXTURES_PER_MATCHWEEK - best)
  }, [inPlayMatchweek, liveScored])

  const breakdown = useMemo(() => {
    if (!inPlay || !inPlay.them || inPlayMatchweek === null) return []
    const mine = perFixture.get(inPlay.you.entry) ?? new Map<number, number>()
    const theirs = perFixture.get(inPlay.them.entry) ?? new Map<number, number>()
    const numbers = [...new Set([...mine.keys(), ...theirs.keys()])].sort((a, b) => a - b)
    return numbers.map((n) => ({
      n,
      label: fixtureLabels.get(n) ?? `Fixture ${n}`,
      mine: mine.get(n) ?? 0,
      theirs: theirs.get(n) ?? 0,
    }))
  }, [inPlay, inPlayMatchweek, perFixture, fixtureLabels])

  /**
   * Is the live duel already decided?
   *
   * A fixture is worth at most `maxPerFixture` — taken from what has actually
   * been paid out rather than assumed, because Results and Scores depths price
   * differently and this component is never told which it is sitting over. If
   * the lead is bigger than everything still to come, it is over: a knockout,
   * called while the last game is still to be played.
   */
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
        />
      )}
      {open && <DuelPanel m={open} state="picking" name={name} person={person} live={null} remaining={null} />}

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
            <p className="t-detail text-white/40 text-center mt-3 pt-3 border-t border-white/10">
              Or a day before you pick, whichever comes first.
            </p>
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

      {/* THE DECIDER — where the duel is actually being won, fixture by
          fixture, and whether anything left can still change it. */}
      {inPlay?.them && breakdown.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <p className="t-caption text-muted px-4 pt-4 pb-3">
            Where it is being won
            <span className="ml-1.5 text-muted/60 normal-case tracking-normal">
              Matchweek {inPlayMatchweek}
            </span>
          </p>
          <ul>
            {breakdown.map((b) => {
              const outcome = b.mine === b.theirs ? 'level' : b.mine > b.theirs ? 'won' : 'lost'
              return (
                <li key={b.n}
                  className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 border-t border-border-default">
                  <span className={`t-detail uppercase tracking-widest w-12 shrink-0
                    ${outcome === 'won' ? 'text-success-600'
                      : outcome === 'lost' ? 'text-danger-600' : 'text-muted/60'}`}>
                    {outcome === 'won' ? 'Won' : outcome === 'lost' ? 'Lost' : 'Level'}
                  </span>
                  <span className="t-body text-muted truncate">{b.label}</span>
                  <span className="t-num t-num-medium text-xs text-muted whitespace-nowrap">
                    {b.mine} <span className="text-muted/40">&ndash;</span> {b.theirs}
                  </span>
                </li>
              )
            })}
          </ul>
          {verdict && (
            <p className="t-body px-4 py-3 border-t border-border-default text-muted">
              {verdict.safe ? (
                <>
                  <b className="text-ink">
                    {verdict.leader === 'you' ? 'Mathematically safe.' : 'Mathematically out of reach.'}
                  </b>{' '}
                  {verdict.leader === 'you'
                    ? `A ${verdict.lead}-point lead with nothing left that can close it — this duel is already won.`
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
        </Card>
      )}

      {/* The rest of the card. Showdown is personal, but the pool is not — five
          duels resolve on the same ten fixtures, and two members sitting level
          makes the afternoon bigger than your own game. */}
      {elsewhere.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <p className="t-caption text-muted px-4 pt-4 pb-3">
            Elsewhere on the card
            <span className="ml-1.5 text-muted/60 normal-case tracking-normal">
              Matchweek {inPlayMatchweek}
            </span>
          </p>
          <ul>
            {elsewhere.map((d) => {
              const lead = d.pa === d.pb ? 'level' : d.pa > d.pb ? 'a' : 'b'
              return (
                <li
                  key={d.id}
                  className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 border-t border-border-default"
                >
                  <span className={`t-body truncate ${lead === 'a' ? 'text-ink font-bold' : 'text-muted'}`}>
                    {name(d.a)}
                  </span>
                  <span className="t-num t-num-extrabold text-sm text-ink whitespace-nowrap">
                    {d.pa} <span className="text-muted/50 font-normal">&ndash;</span> {d.pb}
                  </span>
                  <span className={`t-body truncate text-right ${lead === 'b' ? 'text-ink font-bold' : 'text-muted'}`}>
                    {name(d.b)}
                  </span>
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
  m, state, name, person, live, remaining,
}: {
  m: { duel: DuelRow; you: Side; them: Side | null; matchweek: number }
  state: 'playing' | 'picking'
  name: (e: string | null) => string
  person: (e: string | null) => AvatarPerson | null
  /** Running score, or null before anything has been scored. */
  live: { you: number; them: number } | null
  /** Fixtures in this matchweek with no score row yet. */
  remaining: number | null
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
      <div className="relative px-5 pt-4 pb-5">
        <p className="t-caption text-white/45 text-center mb-4">
          Matchweek {m.matchweek}
          <span className="ml-1.5 text-white/30">
            {state === 'playing' ? 'Being played now' : 'You are picking this one'}
          </span>
        </p>

        {m.them ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 max-w-lg mx-auto">
            <Corner side="blue" label="You" name={name(m.you.entry)} person={person(m.you.entry)} />
            {/* The score, live. A duel with two names and no numbers is a
                fixture list; the numbers are what make it a contest. */}
            {live !== null ? (
              <div className="text-center px-1">
                <div className="flex items-baseline gap-2">
                  <span className="t-display text-4xl text-white">{live.you}</span>
                  <span className="t-display text-lg text-white/25">&ndash;</span>
                  <span className="t-display text-4xl text-white">{live.them}</span>
                </div>
              </div>
            ) : (
              <span className="t-display text-2xl text-accent-400 select-none">V</span>
            )}
            <Corner side="red" label="Them" name={name(m.them.entry)} person={person(m.them.entry)} align="right" />
          </div>
        ) : (
          <p className="t-body text-white/60 text-center max-w-sm mx-auto">
            You sit this one out. With an odd number of members somebody has a bye each
            week — it rotates, so everyone gets the same number.
          </p>
        )}

        {!decided && live && m.them && (
          <p className="t-detail text-white/50 text-center mt-4 pt-4 border-t border-white/10">
            {live.you === live.them
              ? 'Level'
              : `${live.you > live.them ? 'You lead' : 'Behind'} by ${Math.abs(live.you - live.them)}`}
            {remaining ? ` — ${remaining} ${remaining === 1 ? 'game' : 'games'} still to play` : ' — all games played'}
          </p>
        )}
        {decided && (
          <p className="t-caption text-center mt-4 pt-4 border-t border-white/10">
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
function Corner({
  side, label, name, person, align = 'left',
}: {
  side: 'blue' | 'red'
  label: string
  name: string
  person: AvatarPerson | null
  align?: 'left' | 'right'
}) {
  return (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <div
        className={`w-11 h-11 rounded-full mb-2.5 ${align === 'right' ? 'ml-auto' : ''}`}
        style={{
          boxShadow: `0 0 0 3px color-mix(in srgb, var(--${side === 'blue' ? 'primary' : 'danger'}-500) 45%, transparent)`,
          borderRadius: '9999px',
        }}
      >
        {/* The shared circle — hashed gradient and initials, the same face this
            person wears in banter and on the pools list. A duel corner that
            invented its own colour would make one person look like two. */}
        {person
          ? <Avatar person={person} size={44} />
          : <div className="w-11 h-11 rounded-full bg-white/10" aria-hidden="true" />}
      </div>
      <p className="t-detail text-white/35 uppercase tracking-widest">{label}</p>
      <p className="t-display text-xl text-white truncate mt-0.5">{name}</p>
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
