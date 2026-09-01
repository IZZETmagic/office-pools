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
// That is also why `sealedMatchweek` is passed
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
import { avatarColor, avatarInk, type AvatarInk } from '@/lib/design/avatarGradient'
import { DUEL_WIN, DUEL_TIE, duelResult } from '@/lib/league/duelPoints'
import { Icon } from '@/components/ui/Icon'
import { headToHead, type DuelRow } from '@/lib/league/duels'
import { getLiveClock } from '@/lib/matchStatus'
import { LocalTime } from '@/components/LocalTime'
import type { MatchweekFixture } from './PoolDetail'
import { ShowdownBand } from './ShowdownBand'

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
   * The first matchweek still SEALED. Null at the end of the season.
   *
   * ⚠ It used to be paired with `sealedOpensAfter` — "opens when matchweek N
   * is decided" — which the card led with when the rule had no clock. Migration
   * 123's 48-hour hold gives it one, so the card leads with the countdown and
   * that prop is gone rather than left unread.
   */
  sealedMatchweek: number | null
  /** WHEN the duel opens — read from `league_duel_reveals_at` (123). */
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
  /**
   * Go to the Predictions tab.
   *
   * ⚠ A CALLBACK, NOT A `router.push`. This used to push
   * `/pools/{id}?tab=predictions`, which changed the URL and nothing else: the
   * pool page reads `?tab=` in a `useState` INITIALISER, so it is consulted
   * once on mount, and the only thing that re-reads it afterwards is a
   * `popstate` listener. A client-side push to the same route neither remounts
   * the page nor fires popstate, so the address bar said `predictions` while
   * the duel tab stayed on screen — the button looked broken because it did
   * exactly half its job.
   *
   * The parent owns tab state, so the parent switches tabs. This also picks up
   * `handleTabSwitch`'s unsaved-changes guard for free.
   */
  onGoToPicks: () => void
  /**
   * How this tab is being presented.
   *
   * `tabs` — the card, exactly as it has always been.
   * `onepage` — the duel is the head of the page, so the two DuelPanels are
   *   replaced by a sticky `ShowdownBand` and everything BELOW them renders
   *   unchanged. Plan: drafts/2026-08-31_showdown_one_page_plan.md.
   *
   * ⚠ A PROP, NOT A REPLACEMENT. `DuelPanel` is untouched and still the
   * default, so the layout that has been live for two weeks is one query
   * parameter away for as long as the rework is unproven.
   */
  layout?: 'tabs' | 'onepage'
  /** One-page only: render the duel's cards, or just the persistent band. */
  showContent?: boolean
  /** The app header, drawn INSIDE the band in one-page mode. */
  bandHeader?: React.ReactNode
  /** Your points and the pool's median, per matchweek (migration 124). */
  series: Array<{ matchweek_number: number; your_points: number; median_points: number }>
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
      // ⚠ HOURS, NOT DAYS. `1d 21:21:54` made the reader do arithmetic to
      // answer the only question they had — how long — and the two halves were
      // in different units, so the number stopped being scannable at a glance.
      // Hours carry all of it and keep one clock.
      //
      // It cannot run away: the hold is 48h, floored at 24h before lock (123),
      // so this is two digits in every ordinary week. A postponement stalling
      // settlement (094) can push it further, and `padStart(2)` widens rather
      // than truncating — three digits is ugly and correct, which beats tidy
      // and wrong.
      const hh = String(Math.floor(s / 3600)).padStart(2, '0')
      const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
      const ss = String(s % 60).padStart(2, '0')
      setText(`${hh}:${mm}:${ss}`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [to])
  return <>{text}</>
}

/** What a settled duel was, for the form guide. A bye is its own thing. */
type DuelFormResult = 'won' | 'tied' | 'lost' | 'bye'

/**
 * Five dots of DUEL form, oldest on the left — the football convention.
 *
 * ⚠ Deliberately NOT `lib/design/formDots.ts`, and not the `FormDots` further
 * down this file. Both of those colour PICK ACCURACY, on the tier ramp
 * (exact / winner+GD / winner / miss). These are head-to-head results, and
 * green-grey-red for won-tied-lost is the thing every football table already
 * uses. Sharing a component would mean one strip of dots meaning two different
 * things on the same tab.
 *
 * Tuned for the midnight card: the `-400` steps, since the `-500`s go muddy on
 * near-black. A bye is hollow — nothing happened, and it should not read as a
 * result somebody earned.
 */
function DuelFormDots({ form, align = 'left' }: {
  form: DuelFormResult[]
  align?: 'left' | 'right'
}) {
  if (!form.length) {
    return (
      <span className={`block t-num text-white/20 ${align === 'right' ? 'text-right sm:text-left' : ''}`}
            aria-hidden="true">&mdash;</span>
    )
  }
  return (
    <span className={`flex gap-1 ${align === 'right' ? 'justify-end sm:justify-start' : ''}`} aria-hidden="true">
      {form.map((r, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full shrink-0 ${
            r === 'won' ? 'bg-success-400'
              : r === 'lost' ? 'bg-danger-400'
                : r === 'tied' ? 'bg-white/35'
                  : 'border border-white/30'}`}
        />
      ))}
    </span>
  )
}

/**
 * The standings, reduced from the duel rows themselves.
 *
 * Module-level rather than inline in a `useMemo` because it is run TWICE — once
 * for now and once for "before the last matchweek settled", which is where the
 * movement arrows come from. Two copies of this loop would be two chances for
 * the arrow to describe a table nobody is looking at.
 *
 * `enginePoints` is `league_entry_totals.duel_points` when the caller has it.
 * Without it the points are counted from the duels, which agrees with the
 * engine only because `duelPoints.guard.test.ts` holds the constants to the
 * migration that writes them.
 */
function buildDuelTable(
  duels: DuelRow[],
  enginePoints?: Map<string, number>,
): Array<{ entry: string; w: number; d: number; l: number; pts: number }> {
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
      const o = duelResult(p)
      if (o === 'won') r.w++
      else if (o === 'tied') r.d++
      else r.l++
    }
  }
  for (const r of rows.values())
    r.pts = enginePoints?.get(r.entry) ?? r.w * DUEL_WIN + r.d * DUEL_TIE
  return [...rows.values()].sort((a, b) => b.pts - a.pts || b.w - a.w)
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
  label, side, outcome, colour, align = 'left',
}: {
  label: string | null
  side: 'you' | 'them'
  /** Who took the fixture. Absolute — no chip flips it. */
  outcome: 'same' | 'you' | 'them' | 'neither' | 'pending'
  /** Whose chip this is, in their own colour. */
  colour: AvatarInk
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
  // ⚠ THE CHIP IS THE PERSON'S COLOUR, not primary-or-danger. `side` still
  // decides WHICH of the two people it belongs to; it no longer decides the
  // hue, which now comes from whoever that is.
  //
  // A won chip is filled with `strong` under white text, and needs no theme
  // switch — a fill is its own ground. An unwon chip is coloured TEXT, which
  // does: `strong` on the white card, `soft` on the dark one. The border is
  // `currentColor` mixed down, so it follows the text rather than needing a
  // third value.
  const tone =
    won ? 'text-white'
      : outcome === 'same' ? 'bg-mist text-muted'
        : 'border text-[var(--chip-strong)] dark:text-[var(--chip-soft)]'

  return (
    <span className={`block ${align === 'right' ? 'text-right' : ''}`}>
      <span
        style={{
          '--chip-strong': colour.strong,
          '--chip-soft': colour.soft,
          ...(won ? { background: colour.strong } : {}),
          ...(won || outcome === 'same' ? {}
            : { borderColor: 'color-mix(in srgb, currentColor 40%, transparent)' }),
        } as React.CSSProperties}
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
/**
 * Every matchweek as a contest against the room: how far ABOVE or BELOW the
 * pool's median you finished, week by week.
 *
 * ⚠ IT WAS A PAIR OF BARS ON A BASELINE AND IT LOOKED LIKE A SPREADSHEET —
 * Ryan, 2026-08-31, and he was right. Two bars of absolute points ask the
 * reader to do the comparison; the interesting number was never "400", it was
 * "100 clear of the room". So the median becomes the AXIS rather than a second
 * bar, and each week is one mark above or below it.
 *
 * That is the same language as the duel card's strip — a centre line with the
 * result diverging from it — which is deliberate: this is that idea over a
 * season instead of over ten fixtures.
 *
 * ⚠ THE MAGNITUDE IS DELIBERATELY GONE. A 700 in a big week and a 200 in a
 * thin one can both be +100 on the room, and on this chart they look the same
 * — because for a head-to-head pool they ARE the same. The absolute total is
 * the "Season points" card; this one answers a different question.
 *
 * ⚠ Hand-rolled rather than `recharts`, which is a dependency but only earns
 * its weight on the admin dashboard. A div per week costs nothing.
 */
function WeekBars({ series }: {
  series: Array<{ matchweek_number: number; your_points: number; median_points: number }>
}) {
  const rows = series.map((r) => ({ ...r, gap: r.your_points - r.median_points }))
  // Symmetric scale, so +100 and −100 are the same length. A scale fitted to
  // whichever side happens to be bigger would make a good week look modest
  // next to one bad one.
  const reach = Math.max(...rows.map((r) => Math.abs(r.gap)), 1)
  const beat = rows.filter((r) => r.gap > 0).length
  return (
    <div className="px-4 sm:px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-card-title text-ink">Against the room</p>
        <p className="t-caption text-muted">
          {beat} of {rows.length} {rows.length === 1 ? 'week' : 'weeks'}
        </p>
      </div>
      <p className="t-body text-muted mt-1">
        How far above or below the pool&rsquo;s median you finished each matchweek.
      </p>

      <div className="relative mt-5" style={{ height: 112 }}>
        {/* The room. Everything is measured from here. */}
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-default" />
        <div className="absolute inset-0 flex items-stretch justify-start gap-1.5">
          {rows.map((r) => {
            const h = `${(Math.abs(r.gap) / reach) * 50}%`
            return (
              <div key={r.matchweek_number}
                   className="relative flex-1 min-w-[10px] max-w-[34px]"
                   title={`Matchweek ${r.matchweek_number}: ${r.your_points} v median ${r.median_points}`}>
                {r.gap > 0 && (
                  <span className="absolute inset-x-0 bottom-1/2 rounded-t-sm bg-success-500"
                        style={{ height: h }} />
                )}
                {r.gap < 0 && (
                  <span className="absolute inset-x-0 top-1/2 rounded-b-sm bg-danger-500"
                        style={{ height: h }} />
                )}
                {/* Level with the room is a real result, not a gap in the data. */}
                {r.gap === 0 && (
                  <span className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2
                                   rounded-full bg-silver" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ⚠ Only the ENDS are labelled, and only when there are two. Thirty-
          eight numbers under a 112px chart is a ruler; one week with "MW 2" on
          the left and "the room" on the right read as a pairing, which it is
          not. */}
      {rows.length > 1 ? (
        <div className="flex justify-between mt-2">
          <span className="t-detail text-muted">MW {rows[0].matchweek_number}</span>
          <span className="t-detail text-muted">MW {rows[rows.length - 1].matchweek_number}</span>
        </div>
      ) : (
        <p className="t-detail text-muted mt-2">Matchweek {rows[0].matchweek_number}</p>
      )}
    </div>
  )
}

/**
 * Home / draw / away — how a member calls a fixture when left to themselves.
 *
 * ⚠ A TENDENCY, NOT A TREND, which is why one bar is enough and it does not
 * need many weeks the way "Against the room" does.
 *
 * ⚠ IT WAS TOO SMALL AND IT GOT LOST — Ryan, 2026-08-31. A 12px bar over an
 * 10px legend is mostly whitespace, and sat between two cards with 36px
 * numerals it read as a footnote to them rather than a stat of its own. The
 * percentages are now the size of the numbers on the neighbouring cards, which
 * is what makes it a peer of them; the bar became the illustration rather than
 * the content.
 */
function TendencyBar({ home, draw, away }: { home: number; draw: number; away: number }) {
  const seg = [
    { label: 'Home', pct: home, bar: 'bg-primary-500', dot: 'bg-primary-500' },
    { label: 'Draw', pct: draw, bar: 'bg-silver', dot: 'bg-silver' },
    { label: 'Away', pct: away, bar: 'bg-primary-800', dot: 'bg-primary-800' },
  ]
  return (
    <div className="px-4 sm:px-5 py-5">
      <p className="t-card-title text-ink">How you call them</p>
      <p className="t-body text-muted mt-1">
        Which way you lean when you fill in a sheet.
      </p>

      {/* ⚠ Zero-width segments are dropped, not rendered at 0 — a rounded pill
          with a 0% child still paints its own corner radius and leaves a nick
          in the bar. */}
      <div className="flex h-5 rounded-pill overflow-hidden mt-4">
        {seg.filter((x) => x.pct > 0).map((x) => (
          <div key={x.label} className={x.bar} style={{ width: `${x.pct}%` }}
               title={`${x.label} ${x.pct}%`} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        {seg.map((x) => (
          <div key={x.label}>
            <p className="t-num t-num-black text-2xl sm:text-3xl text-ink">{x.pct}%</p>
            <p className="t-caption text-muted mt-1">
              <span className={`inline-block w-2 h-2 rounded-sm mr-1.5 ${x.dot}`} />
              {x.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

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
  onGoToPicks,
  layout = 'tabs',
  showContent = true,
  bandHeader = null,
  series,
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
      // ⚠ `!m.them` FIRST, and it is load-bearing: a bye is worth exactly a
      // tie (250), so it cannot be told apart from one by looking at points.
      if (!m.them) { byes++; continue }
      const r = duelResult(m.you.points)
      if (r === 'won') won++
      else if (r === 'tied') drawn++
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
  const table = useMemo(() => buildDuelTable(duels, duelPoints), [duels, duelPoints])

  /**
   * Each member's last five DUEL results, oldest first.
   *
   * ⚠ NOT the same thing as the Form column on the leaderboard, which is pick
   * accuracy — `exact / winner_gd / winner / miss`. This is won / tied / lost,
   * the head-to-head record, and it is the only form that means anything in a
   * mode whose table is decided by duels. Two different truths about a week
   * would be worse than one, so they get different colours and different dots.
   *
   * ⚠ ORDERED BY `settled_at`, NEVER by matchweek number. Rounds are played out
   * of numerical order (101: a minimum gap of minus 121 days across three real
   * seasons), so numbering them would put a form guide in an order the season
   * was not played in. Settlement time is what "recent" actually means.
   *
   * ⚠ A BYE IS CHECKED STRUCTURALLY, before the points. It pays `DUEL_BYE`,
   * which is exactly `DUEL_TIE`, so reading the number would call it a tie.
   */
  const duelForm = useMemo(() => {
    const byEntry = new Map<string, Array<{ at: string; r: DuelFormResult }>>()
    const push = (e: string | null, at: string, r: DuelFormResult) => {
      if (!e) return
      const list = byEntry.get(e) ?? []
      list.push({ at, r })
      byEntry.set(e, list)
    }
    for (const d of duels) {
      if (!d.settled_at) continue
      if (d.entry_b === null) { push(d.entry_a, d.settled_at, 'bye'); continue }
      push(d.entry_a, d.settled_at, duelResult(d.points_a) ?? 'lost')
      push(d.entry_b, d.settled_at, duelResult(d.points_b) ?? 'lost')
    }
    const out = new Map<string, DuelFormResult[]>()
    for (const [e, list] of byEntry) {
      out.set(e, list.sort((a, b) => a.at.localeCompare(b.at)).slice(-5).map((x) => x.r))
    }
    return out
  }, [duels])

  /**
   * How far each member moved when the last duel settled.
   *
   * ⚠ DERIVED, NOT STORED. `league_entry_totals.previous_final_rank` tracks the
   * WEEKLY ACCURACY rank, which is a different table — using it here would draw
   * an arrow describing somebody else's movement. Rebuilding the standings one
   * settled matchweek short is exact and costs nothing: the rows are already in
   * memory.
   *
   * ⚠ The prior table cannot use `duelPoints`, which is today's total from the
   * engine. It falls back to counting the duels, which is only correct because
   * `DUEL_WIN`/`DUEL_TIE` are guarded against the migration that writes them.
   *
   * Positive is UP the table.
   */
  const movement = useMemo(() => {
    const out = new Map<string, number>()
    const settled = duels.filter((d) => d.settled_at)
    if (!settled.length) return out
    // ⚠ THE MOST RECENTLY SETTLED MATCHWEEK, NOT THE HIGHEST-NUMBERED ONE.
    // Rounds are played out of numerical order — migration 101 measured a
    // minimum gap of MINUS 121 days across three real seasons — so
    // `max(matchweek_number)` picks a week that may not have happened yet, and
    // the arrow would describe a movement nobody made.
    const latest = settled.reduce((a, b) => (a.settled_at! > b.settled_at! ? a : b))
    const before = buildDuelTable(
      duels.filter((d) => d.matchweek_number !== latest.matchweek_number),
    )
    // A member with no prior row is new to the table, not a riser — no arrow.
    const was = new Map(before.map((r, i) => [r.entry, i + 1]))
    table.forEach((r, i) => {
      const prior = was.get(r.entry)
      if (prior !== undefined && prior !== i + 1) out.set(r.entry, prior - (i + 1))
    })
    return out
  }, [duels, table])

  const name = (e: string | null) => (e ? entryNames.get(e) ?? 'Unknown' : 'Bye')
  const person = (e: string | null): AvatarPerson | null => (e ? entryPeople.get(e) ?? null : null)
  /**
   * The team sheet's two colours. `avatarInk` rather than `avatarColor`,
   * because unlike the duel card this sheet is a normal `Card` — white in
   * light, #1C2030 in dark — and the raw avatar stop fails on one ground or
   * the other. Resolved here so the hash and the two OKLab conversions happen
   * twice rather than once per chip per row.
   */
  const inkOf = (e: string | null): AvatarInk => {
    const p = person(e)
    return p ? avatarInk(p.user_id) : { strong: 'var(--neutral-500)', soft: 'var(--neutral-400)' }
  }
  const youInk = inkOf(inPlay?.you.entry ?? null)
  const themInk = inkOf(inPlay?.them?.entry ?? null)
  /**
   * Your colour, for the season table's corner glow.
   *
   * ⚠ `soft` (L=0.70), not the raw stop, for the same reason the duel card's
   * corners use it: at a fixed alpha the ten palette colours differ enough in
   * lightness that a peach glow shouts and an indigo one vanishes. Falls back
   * to slate for a viewer with no entry — a super admin looking in.
   */
  /**
   * The two things a member can look at while the opponent is sealed: how far
   * through their own sheet they are, and how they have been playing.
   *
   * ⚠ BOTH ARE SELF-SCOUTING, and that is forced rather than chosen. The
   * mockup's version of the second card scouts the OPPONENT — "Priya backs the
   * home side 68% of the time" — which cannot exist here: the whole point of
   * the window is that nobody knows who Priya is yet. Pointing the same stats
   * at yourself keeps the card and loses nothing, because a member reading
   * their own tendencies is the one who can act on them.
   *
   * ⚠ `leagueOutcomes` spans the WHOLE SEASON and always includes your own
   * entries — the bulk route withholds other members' picks until revealable,
   * never yours (`bulk/route.ts:110`). So this needs no extra read.
   */
  const mySheet = useMemo(() => {
    const myEntry = ownEntryIds[0]
    if (!myEntry || fixtures.length === 0) return null
    const picked = new Set(
      leagueOutcomes.filter((o) => o.entry_id === myEntry).map((o) => o.match_id),
    )
    const open = fixtures.filter((f) => !picked.has(f.id))
    return { done: fixtures.length - open.length, total: fixtures.length, open }
  }, [leagueOutcomes, fixtures, ownEntryIds])

  const mySeason = useMemo(() => {
    const myEntry = ownEntryIds[0]
    if (!myEntry) return null
    const t = totals.get(myEntry)
    const picks = leagueOutcomes.filter((o) => o.entry_id === myEntry)
    const share = (o: 'home' | 'draw' | 'away') =>
      picks.length ? Math.round((picks.filter((p) => p.outcome === o).length / picks.length) * 100) : null
    const correct = t?.correct ?? 0
    return {
      points: t ? t.totalPoints + t.duelPoints : 0,
      correct,
      picks: picks.length,
      // ⚠ Against picks MADE, not fixtures played. A member who missed a week
      // did not get those wrong — they were not in them, and counting them as
      // misses would report somebody's holiday as bad form.
      accuracy: picks.length ? Math.round((correct / picks.length) * 100) : null,
      // ⚠ Suppressed under ten picks. "100% home" off two picks is noise
      // wearing a percentage, and a tendency needs a season to be one.
      home: picks.length >= 10 ? share('home') : null,
      draw: picks.length >= 10 ? share('draw') : null,
    }
  }, [leagueOutcomes, totals, ownEntryIds])

  const ownWash = (() => {
    const p = person(ownEntryIds[0] ?? null)
    return p ? avatarInk(p.user_id).soft : 'var(--sp-slate)'
  })()
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
      // Hoisted above `outcome`, which needs it: a fixture being PLAYED is not
      // the same thing as one that has not started.
      const clock = getLiveClock({
        status: f.status, livePeriod: f.livePeriod,
        liveMinute: f.liveMinute, liveAdded: f.liveAdded,
      })
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
        // ⚠ `pending` MEANS NOT STARTED, and a match being played is not that.
        // Until the engine writes a score row there is nothing to compare, so
        // nobody can be shown ahead — but "nobody is ahead" is `neither`, which
        // is grey, not the dashed outline that says the game has not kicked
        // off. The dashed chip on a live game was reading as "not started"
        // while the clock beside it ran.
        //
        // This window is short by design and shrinks to nothing once the
        // engine scores live fixtures in production: `scored` goes true on the
        // first sync tick after kickoff and the real outcome takes over.
        !scored ? (clock !== null ? 'neither' : 'pending')
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
        /**
         * ⚠ AT FULL TIME ONLY. This drives which club is bolded and which is
         * faded back, and doing that to a match still being played states an
         * outcome the game has not reached — a live 0-0 read as a settled draw
         * and greyed BOTH clubs out, at the exact moment they are the most
         * interesting thing on the card. 1-0 at 12 minutes would have faded the
         * side that goes on to win 3-1.
         *
         * `isCompleted` rather than a status string: it is the column the
         * engine, the snapshot guard and the matchweek window all settle on,
         * and it stays false through HT, ET and a suspension.
         */
        result:
          !f.isCompleted || f.homeScore === null || f.awayScore === null ? null
            : f.homeScore > f.awayScore ? 'home'
              : f.awayScore > f.homeScore ? 'away' : 'draw',
        outcome,
        scored,
        /**
         * ⚠ THE PILL BELOW HANGS OFF THIS, NOT OFF `outcome`.
         *
         * It used to render on `outcome === 'pending'`, which worked only
         * while "not scored" and "not started" were the same state. The moment
         * a live fixture stopped being `pending` — so its chip could go grey
         * instead of dashed — the red ticking clock vanished from every game
         * in play, which is the one row that most needs it.
         *
         * Whether to show a time is a question about the MATCH, so it is
         * answered from the match: not finished means there is still a clock
         * or a kickoff to show. Who is winning the duel has nothing to do
         * with it, and coupling the two is what broke it.
         */
        isCompleted: f.isCompleted,
        mine: mineP,
        theirs: theirsP,
        myPick,
        theirPick,
        clock,
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

  const bandNode = layout !== 'onepage' ? null : (() => {
        /* ⚠ THE THREE STATES ARE CHOSEN HERE, not in the band, and each one
           reaches for the component this tab already has for it. In play: the
           running score the card shows. Sealed: the same `Countdown` that has
           been on the sealed card since 123. Between the two: the matchweek's
           own name and nothing invented. */
        // The viewer's own entry. `ownEntryIds` is the prop the tab already
        // takes; the sealed band needs it because a sealed week has no duel row
        // to read a side off — that is the whole point of it being sealed.
        const you = ownEntryIds[0] ?? null
        if (!you) return null

        if (inPlay) {
          const y = live(inPlay.you.entry)
          const t = live(inPlay.them?.entry ?? null)
          return (
            <ShowdownBand
              matchweek={inPlay.matchweek}
              youEntry={inPlay.you.entry}
              themEntry={inPlay.them?.entry ?? null}
              name={name} person={person}
              header={bandHeader}
              headline={
                <>
                  <span>{y}</span>
                  <span className="text-white/30 mx-2.5">–</span>
                  <span>{t}</span>
                </>
              }
              sub={remainingFixtures
                ? `${remainingFixtures} ${remainingFixtures === 1 ? 'game' : 'games'} still to play`
                : 'All games played'}
              liveNow={anyFixtureLive}
              strip={breakdown.map((b) => ({ outcome: b.outcome, live: b.clock !== null }))}
              rank={(e) => (e ? totals.get(e)?.rank ?? null : null)}
              points={(e) => (e ? totals.get(e)?.totalPoints ?? null : null)}
            />
          )
        }

        if (sealedMatchweek !== null) {
          return (
            <ShowdownBand
              matchweek={sealedMatchweek}
              youEntry={you}
              themEntry={null}
              name={name} person={person}
              header={bandHeader}
              /* ⚠ YELLOW, and only here. The accent marks the thing you are
                 WAITING on — the same gold the sealed card already uses for its
                 line. A live score is white because it is a fact, not a
                 promise. */
              headline={sealedOpensAtLatest
                ? <span className="text-accent-400"><Countdown to={sealedOpensAtLatest} /></span>
                : <span className="text-white/45">Sealed</span>}
              sub="Until your opponent is revealed"
              rank={(e) => (e ? totals.get(e)?.rank ?? null : null)}
              points={(e) => (e ? totals.get(e)?.totalPoints ?? null : null)}
            />
          )
        }

        if (open) {
          return (
            <ShowdownBand
              matchweek={open.matchweek}
              youEntry={open.you.entry}
              themEntry={open.them?.entry ?? null}
              name={name} person={person}
              header={bandHeader}
              headline={<span className="text-white/45">Not started</span>}
              sub="Picks are open"
              rank={(e) => (e ? totals.get(e)?.rank ?? null : null)}
              points={(e) => (e ? totals.get(e)?.totalPoints ?? null : null)}
            />
          )
        }
        return null
  })()

  /**
   * ⚠ THE BAND IS A SHELL, NOT PART OF THE DUEL VIEW.
   *
   * Ryan's plan: the header persists across every surface you navigate to and
   * back from. So when `showContent` is false this component renders the band
   * and stops — the duel's own cards belong to the duel PAGE, the band belongs
   * to the POOL. One instance either way, so the duel is computed once.
   */
  if (layout === 'onepage' && !showContent) return <>{bandNode}</>

  return (
    <>
    {/* ⚠ THE BAND IS A SIBLING OF THE CONTENT, NOT ITS FIRST CHILD.
        Measured, not reasoned: inside the padded wrapper its content box came
        out 908px against 940px on every other surface — a 32px shift, because
        `padding: calc(50vw - 50%)` resolves that 50% against its PARENT, and
        the parent here carries `px-4 sm:px-6` while elsewhere the band hangs
        straight off the measure container. Same parent on both now. */}
    {bandNode}
    <div className={layout === 'onepage'
      /* ⚠ CAPPED TO THE BAND'S OWN WIDTH. The band's gradient runs edge to
         edge but its CONTENTS stop at 940px; letting the cards beneath run to
         1200px+ made the page read as two different documents stacked on each
         other. Same measure, one column, centred — the gutter is on this
         element because the band is deliberately full-bleed past it. */
      /* ⚠ NO `pt-*`. The band is the FIRST CHILD of this wrapper on the duel
         page, and it is full-bleed — it cancels the horizontal gutter with
         negative margins but cannot cancel top padding, so `pt-4` showed as a
         strip of page above it. Nowhere else did: every other surface gets the
         band from the `!showContent` branch, which has no wrapper at all.
         `space-y` still puts the gap between the band and the first card,
         which is the space that was actually wanted. */
      /* ⚠ `pt-5` IS BACK, AND IS NOW SAFE. It was removed when the band was
         this wrapper's first child, where top padding showed as a strip of
         page ABOVE the band. The band is a sibling now, so this is simply the
         gap beneath it — and it matches <main>'s `pt-5` on every other
         surface, so the duel and the picks start at the same height. */
      ? 'px-4 sm:px-6 pt-5 pb-10 space-y-4 md:space-y-5'
      : 'space-y-4'}>
      {/* ⚠ ONE-PAGE: the band stands in for the two cards below it and nothing
          else changes. It takes DuelPanel's props verbatim — every number is
          already computed for the card, and a band that derived its own would
          be a second opinion about the same duel. */}

      {/* Being played now, then the one you are still picking. Both, because
          they are different weeks all weekend. */}
      {layout === 'tabs' && inPlay && (
        <DuelPanel
          m={inPlay} state="playing" name={name} person={person}
          live={{ you: live(inPlay.you.entry), them: live(inPlay.them?.entry ?? null) }}
          remaining={remainingFixtures}
          liveNow={anyFixtureLive}
          // ⚠ `b.clock !== null` is the same live test the red dot above uses
          // (`getLiveClock` returns null unless the status is 'live'), so the
          // dot and the flashing chips can never disagree about whether a game
          // is on. Two definitions of "live" on one card would be one too many.
          strip={breakdown.map((b) => ({ outcome: b.outcome, live: b.clock !== null }))}
        />
      )}
      {layout === 'tabs' && open && (
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
      {/* ⚠ NOT IN ONE-PAGE. The band at the top of the page is this card — same
          matchweek, same countdown, same two faces — so rendering both puts
          the identical thing on screen twice, once stuck to the top and once
          scrolling under it. In tab mode it is still the whole sealed state
          and is untouched. */}
      {layout === 'tabs' && inPlayMatchweek === null && sealedMatchweek !== null && (
        <div className="rounded-card overflow-hidden bg-midnight relative">
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            /* Your colour on the left; the right stays SLATE because there is
               no opponent yet to have one — that absence is the card. */
            style={{
              background:
                'linear-gradient(105deg,' +
                ` color-mix(in srgb, ${
                  youPerson ? avatarInk(youPerson.user_id).soft : 'var(--sp-slate)'
                } 22%, transparent) 0%,` +
                ' transparent 52%, color-mix(in srgb, var(--sp-slate) 14%, transparent) 100%)',
            }}
          />
          <div className="relative px-5 md:px-10 pt-6 pb-7 sm:pt-10 sm:pb-12">
            {/* ⚠ THE MATCHWEEK LEADS. It was an 11px eyebrow with "Opponent
                sealed" trailing after it, so the first thing on the card was a
                state and the thing that tells you WHICH WEEK you are looking at
                was the smallest text on screen. The sealed state is already
                said three ways below — a redacted bar, a dashed "?", and a
                countdown "until your opponent is revealed" — so saying it a
                fourth time up here bought nothing. */}
            <p className="t-display text-2xl sm:text-3xl text-white text-center">
              Matchweek {sealedMatchweek}
            </p>

            {/* ⚠ THE CLOCK IN THE MIDDLE, THE FACES IN THE CORNERS — Ryan,
                2026-08-31. The countdown IS the event of this card, so it takes
                the centre column and the faces move to the edges rather than
                huddling around a "V". Same grid as the duel card's hero, which
                is the point: this is that card with the score not yet written.

                The avatars are 72px from `sm` — larger than the duel card's 64
                — because on this card they are all there is. */}
            {/* ⚠ THE PHONE STACKS. At 375px a three-column row cannot hold two
                72px faces AND "3d 00:25:23" — the clock ran straight through
                the "?" circle. So the phone puts the countdown on its own row
                above the two faces, and the corners layout starts at `sm`,
                which is where Ryan asked for it anyway. */}
            <div className="grid grid-cols-[1fr_auto_1fr] sm:grid-cols-[auto_1fr_auto] items-center
                            gap-x-6 gap-y-5 sm:gap-8 mt-6 sm:mt-10">
              <div className="order-2 sm:order-none justify-self-start sm:justify-self-auto
                              flex flex-col items-center gap-2 min-w-0">
                {/* ⚠ ONE SIZE, BOTH BREAKPOINTS. This was `w-14 h-14
                    sm:w-[72px]` around an `Avatar size={72}` — so on a phone a
                    72px face sat inside a 56px box and the ring, drawn on the
                    BOX, came out smaller than the thing it was ringing. The
                    `size` prop is inline pixels and cannot be responsive, so
                    the container must not be either. */}
                <div
                  className="w-16 h-16 rounded-full shrink-0"
                  style={{
                    boxShadow: `0 0 0 3px color-mix(in srgb, ${
                      youPerson ? avatarColor(youPerson.user_id) : 'rgba(255,255,255,0.20)'
                    } 45%, transparent)`,
                  }}
                >
                  {youPerson
                    ? <Avatar person={youPerson} size={64} />
                    : <div className="w-16 h-16 rounded-full bg-white/10" aria-hidden="true" />}
                </div>
                {/* ⚠ THEIR NAME, NOT "YOU". The other side of this card is a
                    blank where a name will be, so the contrast only reads if
                    ours is a name too. */}
                <div className="min-w-0 text-center">
                  <p className="t-display text-base sm:text-lg text-white truncate max-w-[9rem]">
                    {name(youEntry)}
                  </p>
                  {youMeta && (
                    <p className="t-num t-num-medium text-xs text-white/45 mt-0.5 whitespace-nowrap">
                      {youMeta}
                    </p>
                  )}
                </div>
              </div>

              <div className="order-1 col-span-3 sm:col-span-1 sm:order-none text-center min-w-0">
                {sealedOpensAtLatest && (
                  <p className="t-num t-num-black text-3xl sm:text-6xl text-accent-400
                                whitespace-nowrap">
                    <Countdown to={sealedOpensAtLatest} />
                  </p>
                )}
                <p className="t-caption text-white/45 mt-2">
                  until your opponent is revealed
                </p>
              </div>

              {/* ⚠ THE V IS PHONE-ONLY. On desktop the countdown sits between
                  the two and does the separating; stacked, the faces are just
                  two circles at opposite edges with nothing saying they are
                  opposed. */}
              {/* ⚠ ALIGNED TO THE FACES, NOT THE ROW. The grid centres on the
                  whole row, and each face column carries a name and a meta
                  line under it — so a centred V sat ~40px BELOW the two
                  circles it was meant to sit between. `self-start` plus half
                  an avatar puts it on their axis. */}
              <span className="order-2 sm:hidden t-display text-xl text-accent-400
                               justify-self-center self-start mt-[22px] select-none"
                    aria-hidden="true">V</span>

              <div className="order-3 sm:order-none justify-self-end sm:justify-self-auto
                              flex flex-col items-center gap-2 min-w-0">
                <div className="w-16 h-16 rounded-full shrink-0
                                flex items-center justify-center border border-dashed
                                border-white/25 t-display text-2xl text-white/35">
                  ?
                </div>
                {/* ⚠ TWO BARS, MIRRORING NAME AND RECORD. One bar left this
                    column a line shorter than yours, and with the grid centring
                    each column independently that put the "?" 13px BELOW your
                    face — measured. Redacting both lines makes the columns the
                    same height, so the two circles land on one axis without
                    anything being positioned by hand.

                    Redacted, not blank: withheld reads differently from
                    missing, and both their name and their record are withheld. */}
                <div className="h-[18px] w-24 rounded bg-white/10" aria-hidden="true" />
                <div className="h-3 w-16 rounded bg-white/[0.07]" aria-hidden="true" />
                <span className="sr-only">Opponent not yet revealed</span>
              </div>
            </div>

            {/* ⚠ THE RULE EXPLAINER IS GONE from this card — Ryan's call. It
                read "Two days after your last duel is decided, or a day before
                you pick — whichever comes first", which is the disclosure
                sentence and belongs where somebody goes to READ the rules.
                Both Pool Info and Scoring Rules still carry it and
                `leagueModeCopy.guard.test.ts` REQUIRES them to, so the gate is
                unaffected: the mechanic is disclosed, one tap away, and this
                surface is the ceremony rather than the manual. */}
          </div>
        </div>
      )}

      {/* YOUR SHEET — the one thing a member can DO in the window.
          ⚠ Picks are open the whole time the opponent is sealed; that is the
          design. A progress bar and the games still missing turn the wait into
          preparation rather than dead time. */}
      {inPlayMatchweek === null && sealedMatchweek !== null && mySheet && (
        <Card padding="md">
          <div className="flex items-baseline justify-between gap-3">
            <p className="t-caption text-muted">Your sheet</p>
            <p className="t-num t-num-extrabold text-ink">
              {mySheet.done} <span className="text-muted">/ {mySheet.total}</span>
            </p>
          </div>
          <div className="h-2 rounded-pill bg-mist mt-3 overflow-hidden">
            <div
              className="h-full rounded-pill bg-primary-500 transition-[width] duration-500"
              style={{ width: `${(mySheet.done / mySheet.total) * 100}%` }}
            />
          </div>
          {mySheet.open.length === 0 ? (
            /* ⚠ A FINISHED SHEET GETS A WAY IN, NOT A TASK. We still do not
               ask for something already done — "Finish your picks" on a full
               sheet is nagging — but reviewing is not asking.
               ⚠ AND IT IS THE SAME BLUE BUTTON. I made it a secondary outline
               to keep the primary "for the state that needs an action"; Ryan
               overturned it, and he is right — this is the only action on the
               card either way, so demoting it just made the card look like it
               had nothing to offer. */
            /* ⚠ FULL WIDTH ON A PHONE, AUTO ON A DESKTOP. A pill stretched
               across 900px is a thumb target solving a problem a mouse does
               not have — it reads as a banner, not a button. Stacked under the
               sentence on a phone where width is the affordance; beside it from
               `sm`, sized to its own label. */
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="t-body text-muted">Your sheet is in. Nothing left to pick.</p>
              <button
                type="button"
                onClick={onGoToPicks}
                className="w-full sm:w-auto shrink-0 rounded-pill bg-primary-600 text-white
                           t-caption px-6 py-3 hover:bg-primary-700 active:bg-primary-800
                           transition-colors"
              >
                See your picks
              </button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="t-body text-muted">
                {mySheet.open.slice(0, 2)
                  .map((f) => `${f.homeName} v ${f.awayName}`)
                  .join(' and ')}
                {mySheet.open.length > 2 && ` and ${mySheet.open.length - 2} more`}
                {' '}still open.
              </p>
              <button
                type="button"
                onClick={onGoToPicks}
                className="w-full sm:w-auto shrink-0 rounded-pill bg-primary-600 text-white
                           t-caption px-6 py-3 hover:bg-primary-700 active:bg-primary-800
                           transition-colors"
              >
                Finish your picks
              </button>
            </div>
          )}
        </Card>
      )}

      {/* WHAT IT WILL BE DECIDED ON — the matchweek you are picking, during the
          wait. ⚠ Picks are OPEN the whole time the opponent is sealed; that is
          the design, not an accident. This is the one thing a member can
          actually do in the window, so it turns the wait into preparation
          rather than dead time.

          ⚠ These are already on the page: `liveMw` falls back to the OPEN
          matchweek when nothing is in play, and during the sealed window the
          open matchweek IS the sealed one. No extra read. */}
      {inPlayMatchweek === null && sealedMatchweek !== null && fixtures.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 pt-5 pb-3">
            <p className="t-card-title text-ink">
              What it will be decided on
            </p>
            <span className="t-caption text-muted">{fixtures.length} fixtures</span>
          </div>
          <ul>
            {fixtures.map((f) => (
              <li key={f.id}
                  className="flex items-center gap-3 px-4 sm:px-5 py-2.5 border-t border-border-default">
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <Crest url={f.homeCrest} name={f.homeName} />
                  <span className="t-body text-ink truncate">{f.homeName}</span>
                </span>
                <span className="t-detail text-muted shrink-0">v</span>
                <span className="flex items-center gap-2 min-w-0 flex-1 justify-end">
                  <span className="t-body text-ink truncate text-right">{f.awayName}</span>
                  <Crest url={f.awayCrest} name={f.awayName} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* ⚠ ONE CARD PER STAT — Ryan, 2026-08-31. They were four rows of a
          single table, which made a season's worth of different questions look
          like one list. The two numbers sit two-up on a desktop so four cards
          do not become four full-width slabs; the two charts get their own
          width because a chart squeezed to half a column is a sparkline.

          See the note on `mySeason`: these scout the READER. Scouting the
          opponent is impossible while the opponent is sealed, which is the
          entire point of the window. */}
      {inPlayMatchweek === null && sealedMatchweek !== null && mySeason && (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card padding="md">
              <p className="t-caption text-muted">Season points</p>
              <p className="t-num t-num-black text-4xl text-ink mt-2">{mySeason.points}</p>
            </Card>
            <Card padding="md">
              <p className="t-caption text-muted">Accuracy</p>
              <p className="t-num t-num-black text-4xl text-ink mt-2">
                {mySeason.accuracy === null ? '—' : `${mySeason.accuracy}%`}
              </p>
              <p className="t-body text-muted mt-1">
                {mySeason.correct} of {mySeason.picks} picks
              </p>
            </Card>
          </div>

          {series.length > 0 && (
            <Card padding="none" className="overflow-hidden">
              <WeekBars series={series} />
            </Card>
          )}

          {mySeason.home !== null && (
            <Card padding="none" className="overflow-hidden">
              <TendencyBar home={mySeason.home} draw={mySeason.draw ?? 0}
                           away={100 - mySeason.home - (mySeason.draw ?? 0)} />
            </Card>
          )}
        </>
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
            {/* The two column headings are the same two colours as the chips
                beneath them — which is what makes the sheet readable without a
                key, and what "You" in blue against a name in RED never was. */}
            <span className="t-caption text-[var(--chip-strong)] dark:text-[var(--chip-soft)]"
                  style={{ '--chip-strong': youInk.strong, '--chip-soft': youInk.soft } as React.CSSProperties}>
              You
            </span>
            <span className="t-caption text-muted text-center">{breakdown.length} fixtures</span>
            <span className="t-caption text-right truncate text-[var(--chip-strong)] dark:text-[var(--chip-soft)]"
                  style={{ '--chip-strong': themInk.strong, '--chip-soft': themInk.soft } as React.CSSProperties}>
              {name(inPlay.them.entry)}
            </span>
          </div>

          <ul>
            {breakdown.map((b) => (
              <li key={b.n}
                className={`grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.75rem_1fr_4.75rem] items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3.5 border-t border-border-default
                  ${b.outcome === 'pending' ? 'bg-primary-50/40 dark:bg-primary-900/10 py-4' : ''}`}>
                <PickChip label={b.myPick} side="you" outcome={b.outcome} colour={youInk} />

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
                  {!b.isCompleted && (
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

                <PickChip label={b.theirPick} side="them" outcome={b.outcome} colour={themInk} align="right" />
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

      {/* THE SEASON — the duel table, in the arena treatment.
          ⚠ DARK, LIKE THE DUEL CARD AT THE TOP, and that is the point of the
          change rather than decoration. This is the standing record of the mode
          — the thing members argue about in November — and it was the quietest
          card on the tab: a white table of small grey integers, fifth in the
          scroll, indistinguishable from the working detail above it. The tab
          now opens and closes in the same world (this week's duel, then the
          season) with the light cards carrying the detail in between. It is
          also RN's own treatment: `LiveMatchCard` is a #0F0F1A → #1A1830
          diagonal with a coloured glow bleeding in from one corner.

          ⚠ THE FACES ARE THE POINT, not the darkness. Every other surface on
          this tab now carries somebody's colour; this table was the one place
          still purely textual, so it was the one place you could not find
          yourself at a glance. */}
      <div className="rounded-card overflow-hidden bg-midnight relative">
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(160deg,' +
              ` color-mix(in srgb, ${ownWash} 16%, transparent) 0%,` +
              ' transparent 46%)',
          }}
        />
        {/* YOUR RECORD, folded in. It used to be its own white `Card` directly
            above this one, which restated row 1 in different type and — once
            this card went dark — read as a stranded slab. Nothing is lost: the
            same four numbers, now the header of the thing they describe.

            ⚠ IT ALSO CARRIED TWO STALE SUMS. It computed `won * 3 + drawn`,
            which is the pre-121 rate, and it never counted BYES at all —
            worth a point since migration 100 and 250 since 121. Both are gone:
            the engine's own `duel_points` is the number, and the fallback only
            runs for an entry the engine has no row for. */}
        <div className="relative flex flex-col sm:flex-row sm:items-end sm:justify-between
                        gap-3 px-4 pt-5 pb-4">
          <p className="t-caption text-white/45">The season</p>
          <div className="flex items-baseline gap-4 sm:gap-5">
            <Stat label="Won" value={record.won} tone="dark" />
            <Stat label="Tied" value={record.drawn} tone="dark" />
            <Stat label="Lost" value={record.lost} tone="dark" />
            {record.byes > 0 && <Stat label="Byes" value={record.byes} tone="dark" />}
            <span className="flex flex-col pl-3 sm:pl-4 border-l border-white/10">
              <span className="t-num t-num-black text-2xl text-white">
                {duelPoints.get(youEntry ?? '')
                  ?? record.won * DUEL_WIN + (record.drawn + record.byes) * DUEL_TIE}
              </span>
              <span className="t-detail text-white/40 uppercase tracking-widest mt-0.5">duel points</span>
            </span>
          </div>
        </div>

        {/* ⚠ THE PHONE SHOWS FORM INSTEAD OF W/T/L — Ryan's call, 2026-08-31,
            once the form column made seven columns at 375px.

            This is NOT the "crunch, don't drop" rule from `LeagueTableTab`
            being abandoned. That rule is about never LOSING information to fit,
            and it stood while the choice was six columns or five. Seven changed
            the question from "can it fit" — measured, it could — to "what
            earns a phone's width", and five dots of form carry more than three
            integers do: the shape of somebody's season rather than its totals,
            in less space. Your OWN W/T/L is in the header above regardless, and
            the desktop keeps all seven.

            Gutters stay px-0.5 on a phone and px-2 from `sm`, and the type
            steps to `text-xs`, so the desktop rhythm is untouched.

            `overflow-x-auto` stays as a floor for an unusually long name. */}
        <div className="relative overflow-x-auto">
          <table className="w-full text-xs sm:text-sm tabular-nums">
            <thead>
              <tr className="t-caption text-white/40">
                <th className="pt-5 pb-3.5 pl-2.5 pr-0.5 sm:pl-4 sm:pr-1 text-left w-8 sm:w-11">#</th>
                <th className="pt-5 pb-3.5 px-1 sm:px-2 text-left">Member</th>
                {/* Beside the name rather than out past the totals: identity,
                    then recent shape, then the numbers. Same order as the
                    leaderboard's own PLAYER / FORM / STATS. */}
                <th className="pt-5 pb-3.5 px-2 text-right sm:text-left w-[58px] sm:w-16">Form</th>
                <th className="hidden sm:table-cell pt-5 pb-3.5 px-2 text-right w-9">W</th>
                <th className="hidden sm:table-cell pt-5 pb-3.5 px-2 text-right w-9">T</th>
                <th className="hidden sm:table-cell pt-5 pb-3.5 px-2 text-right w-9">L</th>
                <th className="pt-5 pb-3.5 pl-2 pr-3 sm:pr-4 text-right w-12 sm:w-16">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => {
                const you = own.has(r.entry)
                const p = person(r.entry)
                const colour = p ? avatarColor(p.user_id) : 'rgba(255,255,255,0.35)'
                const moved = movement.get(r.entry) ?? 0
                return (
                  <tr
                    key={r.entry}
                    className="border-t border-white/10"
                    /* Your row wears YOUR colour, faintly — the same hue as your
                       face two rows up in the duel card, so finding yourself is
                       recognition rather than reading ten names. */
                    style={you
                      ? { background: `color-mix(in srgb, ${colour} 14%, transparent)`,
                          boxShadow: `inset 3px 0 0 0 ${colour}` }
                      : undefined}
                  >
                    <td className="py-2.5 pl-2.5 pr-0.5 sm:pl-4 sm:pr-1">
                      <span className="flex items-baseline gap-1">
                        <span className={`t-num t-num-medium ${
                          i === 0 ? 'text-accent-400' : you ? 'text-white' : 'text-white/45'}`}>
                          {i + 1}
                        </span>
                        {/* ⚠ Silent until a duel settles. With nothing played
                            every position is a tie nobody moved into, and an
                            arrow would be inventing a story. */}
                        {moved !== 0 && (
                          <span className={`text-[9px] font-bold ${
                            moved > 0 ? 'text-success-400' : 'text-danger-400'}`}>
                            {moved > 0 ? '▲' : '▼'}{Math.abs(moved)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-1 sm:px-2">
                      <span className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                        {p
                          ? <Avatar person={p} size={22} />
                          : <span className="block w-[22px] h-[22px] rounded-full bg-white/10 shrink-0" />}
                        <span className={`truncate ${you ? 'font-bold text-white' : 'font-semibold text-white/85'}`}>
                          {name(r.entry)}
                        </span>
                      </span>
                    </td>
                    <td className="py-2.5 px-2">
                      {/* Right-aligned on a phone, where it is the last thing
                          before Pts and reads as part of that block; left on
                          desktop, where W/T/L follow it. */}
                      <DuelFormDots form={duelForm.get(r.entry) ?? []} align="right" />
                    </td>
                    <td className="hidden sm:table-cell py-2.5 px-2 text-right t-num text-white/55">{r.w}</td>
                    <td className="hidden sm:table-cell py-2.5 px-2 text-right t-num text-white/55">{r.d}</td>
                    <td className="hidden sm:table-cell py-2.5 px-2 text-right t-num text-white/55">{r.l}</td>
                    <td className="py-2.5 pl-2 pr-3 sm:pr-4 text-right t-num t-num-black text-white">{r.pts}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
    </>
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
  /**
   * One entry per fixture: who is taking it, and whether a ball is in play in
   * it right now. `live` drives the flash and nothing else — the COLOUR is the
   * same function of the score whether the game is running or finished.
   */
  strip: Array<{
    outcome: 'you' | 'them' | 'same' | 'neither' | 'pending'
    live: boolean
  }>
}) {
  const decided = m.duel.settled_at && m.them
  /** A duellist's own colour — the one their avatar opens with. */
  const colourOf = (e: string | null) => {
    const p = person(e)
    return p ? avatarColor(p.user_id) : 'rgba(255,255,255,0.35)'
  }
  // Resolved once, out here: inside the strip's `.map` the `m.them` null-check
  // does not narrow, and it would recompute the hash per segment anyway.
  const yourColour = colourOf(m.you.entry)
  const theirColour = m.them ? colourOf(m.them.entry) : ''
  /** The corner wash: lightness-normalised, so neither corner outshines the other. */
  const washOf = (e: string | null) => {
    const p = person(e)
    return p ? avatarInk(p.user_id).soft : 'var(--sp-slate)'
  }
  const yourWash = washOf(m.you.entry)
  const theirWash = m.them ? washOf(m.them.entry) : 'var(--sp-slate)'
  return (
    <div className="rounded-card overflow-hidden bg-midnight relative">
      {/* YOUR corner bleeding in from the left, THEIRS from the right — the
          last thing on this card that was primary-and-danger. A fixed blue/red
          wash behind two identity-coloured avatars would have been a second,
          contradicting colour system: a green-versus-violet duel sat under a
          wash matching neither player.

          ⚠ `soft`, NOT the raw stop the ring and the strip use, and the reason
          is intensity rather than hue. The ten stops span L=0.585 to L=0.821,
          so at one fixed alpha a peach corner glows and an indigo one barely
          shows — on a duel card an uneven wash reads as one side winning.
          `soft` normalises every colour to L=0.70 first, so both corners carry
          the same weight whoever is in them, which is also why the two mixes
          are now equal at 30% where they used to be 30/32.

          A BYE has no opponent to have a colour, so that side falls back to
          slate — the same thing the sealed card does with its unknown half. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(105deg,' +
            ` color-mix(in srgb, ${yourWash} 30%, transparent) 0%,` +
            ' transparent 44%, transparent 56%,' +
            ` color-mix(in srgb, ${theirWash} 30%, transparent) 100%)`,
        }}
      />
      {/* ⚠ WIDER SIDE PADDING ON DESKTOP. The avatars and names sit on the
          grid's outer edges, so the card's own padding is the only thing
          holding them off the rounded corner — at 20px they were pressed
          against it. */}
      <div className="relative px-5 md:px-12 pt-6 pb-7 sm:pt-7 sm:pb-8">
        {/* More air under the matchweek heading before the contest starts. */}
        <div className="flex items-center justify-center gap-2.5 mb-8 md:mb-10">
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
                <AvatarRing person={person(m.you.entry)} />
              </span>
              {live !== null ? (
                /* ⚠ BOTH NUMBERS ARE WHITE, and that is deliberate.
                   They used to be primary-400 against danger-400 — two big
                   saturated digits, one blue one red, side by side on a dark
                   ground, which is the exact shape of an election-night tally
                   and read as one. Nothing about a score is a side: the avatar
                   directly above each number already says whose it is, so
                   colouring the digit encoded the same fact twice and spent the
                   card's loudest element doing it. Identity lives in the faces;
                   these are just the numbers. */
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="t-display text-4xl sm:text-5xl text-white">{live.you}</span>
                  <span className="t-display text-xl sm:text-2xl text-white/30">&ndash;</span>
                  <span className="t-display text-4xl sm:text-5xl text-white">{live.them}</span>
                </div>
              ) : (
                <span className="t-display text-2xl sm:text-3xl text-accent-400 select-none">V</span>
              )}
              <span className="flex justify-end">
                <AvatarRing person={person(m.them.entry)} />
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
            Your colour you took it, theirs they took it, grey a dead heat
            neither could win, hollow still to come. It is the team sheet below
            compressed to a glance: you can see the SHAPE of the duel and how
            much is left.

            ⚠ THE COLOURS ARE THE TWO PEOPLE'S OWN, not primary and danger.
            `avatarGradient.ts` states the rule this card used to break — one
            person, one colour, or "a person who is teal in the chat and purple
            on the card reads as two people" — and this was the screen painting
            both duellists in colours belonging to neither of them.

            It also means the strip needs NO legend, which the fixed pair never
            managed: the two faces are already at the top of this card, so a
            blue segment under a blue avatar is self-evident. Before, blue and
            red pointed at nothing on screen.

            ⚠ THE LEGEND IS THE ONLY THING CARRYING IT, so it is worth knowing
            what happens when two members clash. Roughly one duel in seven draws
            a pair you cannot separate: ~10% hash to the same one of the ten, and
            coral/rose and sky/indigo are near-identical on top of that
            (measured in OKLab). When that happens this bar stops distinguishing
            anybody — it does not mislead, it just says less, and the team sheet
            underneath carries the same information in full. Ryan's call,
            2026-08-31, taking the flat bar over a diverging chart that encoded
            the sides by direction instead.

            ⚠ Desktop only. The phone card is already right and this is width
            that only a wide card has going spare — it is not information the
            small screen is missing, it is the same information the sheet under
            it carries in full.

            ⚠ CAPPED AND CENTRED, so it lives under the SCORE rather than
            running the full width and passing beneath the avatars and names. It
            describes the contest in the middle of the card; stretched past the
            two people it read as a divider. */}
        {strip.length > 0 && m.them && (
          <div className="hidden md:flex items-stretch gap-1 mt-7 h-1.5 max-w-xs mx-auto w-full" aria-hidden="true">
            {strip.map(({ outcome: o, live: isLive }, i) => (
              <span
                key={i}
                className={`flex-1 rounded-full ${isLive ? 'duel-chip-live' : ''} ${
                  o === 'same' || o === 'neither' ? 'bg-white/15'
                    : o === 'pending' ? 'border border-dashed border-white/25' : ''}`}
                style={o === 'you' ? { background: yourColour }
                  : o === 'them' ? { background: theirColour }
                    : undefined}
              />
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
            <span className={duelResult(m.you.points) === 'won' ? 'text-success-400'
              : duelResult(m.you.points) === 'tied' ? 'text-accent-400' : 'text-white/40'}>
              {duelResult(m.you.points) === 'won' ? `You won this duel — ${DUEL_WIN} points`
                : duelResult(m.you.points) === 'tied' ? `A tie — ${DUEL_TIE} each`
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
function AvatarRing({ person }: { person: AvatarPerson | null }) {
  // ⚠ THE RING IS THE PERSON'S OWN COLOUR, and it used to be a `side` prop
  // reading primary-500 or danger-500. That put a RED ring around a PINK face
  // — the one thing a ring must never do, since it is drawn touching the very
  // colour it contradicts. There is no `side` any more: nothing on this card
  // is blue-versus-red, it is one member's colour against another's.
  const ring = person ? avatarColor(person.user_id) : 'rgba(255,255,255,0.20)'
  return (
    <div
      className="w-12 h-12 sm:w-14 sm:h-14 rounded-full shrink-0"
      style={{
        boxShadow: `0 0 0 3px color-mix(in srgb, ${ring} 45%, transparent)`,
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

function Stat({ label, value, tone = 'light' }: {
  label: string
  value: number
  /** `dark` for the midnight season card; the default is a normal white Card. */
  tone?: 'light' | 'dark'
}) {
  return (
    <span className="flex flex-col">
      <span className={`t-num t-num-extrabold text-xl ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>
        {value}
      </span>
      <span className={`t-detail uppercase tracking-widest mt-0.5 ${
        tone === 'dark' ? 'text-white/40' : 'text-muted'}`}>
        {label}
      </span>
    </span>
  )
}
