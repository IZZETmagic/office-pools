'use client'

import { DetailCard, DetailCaption, DetailRow } from '@/components/ui/DetailCard'
import { formatNumber } from '@/lib/format'

// =============================================================
// SCORING RULES — the league version
// =============================================================
// WHY THIS IS A SEPARATE SCREEN rather than ScoringRulesTab with the World Cup
// parts hidden.
//
// Until 2026-08-24 every league pool rendered ScoringRulesTab unchanged: Group
// Stage, Knockout Stage with a ×8 Final multiplier, Penalty Shootout, "all 48
// group matches", "the 32 qualifying teams", a 1,000-point Champion bonus. None
// of it can ever be scored in a league.
//
// ⚠ And one line of it was not merely irrelevant, it was WRONG. At Results
// depth the engine charges a correct tap at `px_results`, which reads
// `group_exact_score` — the pool's TOP price, 100 by default (migration 066:
// "getting the outcome right is the most that can be achieved, so the top price
// is the semantically right one to charge it at"). The old screen showed that
// same 100 under the label "Exact Score", and showed "Correct Result — 50 pts"
// directly beneath it. A member who called Arsenal to win and read this page
// learned their pick was worth 50. It is worth 100.
//
// Hiding cards would have left the World Cup's skeleton showing — its structure
// is groups-and-knockouts the whole way down, and a league has one price, one
// lock rhythm and a depth. So this states the league's own rules in the
// league's own shape.
//
// ============================================================
// EVERY NUMBER HERE IS READ, NOT WRITTEN
// ============================================================
// The values come from the same columns the engines COALESCE against, so this
// screen cannot drift into describing scoring nobody is using:
//
//   fixtures   pool_settings.group_*            -> league_score_fixture (055/066)
//   duels      3 / 1 / 0, fixed                 -> league_score_duels   (084)
//   table      league_pool_settings.table_*     -> league_score_table   (080)
//   ordering   league_finalize_ranks' ORDER BY  -> (059, 084, 087)
//
// If you change one of those, change this. The tie-break card in particular
// mirrors an ORDER BY that three migrations have now edited.
// =============================================================

export type LeagueScoringMode = 'pickem' | 'showdown' | 'last_man_standing' | 'table'

export type LeagueTablePrices = {
  exactPoints: number
  stepPenalty: number
  championBonus: number
  topFourBonus: number
  relegationBonus: number
  perfectTopFourBonus: number
  topN: number
  relegationN: number
  /** 'headline_only' scores the bands alone — no per-position arithmetic. */
  profile: 'full_table' | 'headline_only'
}

type Props = {
  mode: LeagueScoringMode
  /** Null for the two modes that have no fixture picks. */
  depth: 'results' | 'scores' | null
  /** The three fixture prices, straight from `pool_settings`. */
  prices: { exact: number; goalDifference: number; result: number }
  /** Table mode only. */
  table?: LeagueTablePrices | null
  /** Shown so "one club, once" has a denominator. */
  clubCount?: number | null
}

function PointsRow({ label, value }: { label: string; value: number }) {
  return (
    <DetailRow label={label}>
      <span className="t-num text-sm text-ink whitespace-nowrap">
        {formatNumber(value)} {value === 1 ? 'pt' : 'pts'}
      </span>
    </DetailRow>
  )
}

function Step({ n, children }: { n: number | string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-pill bg-primary-600/12 text-primary-800 flex items-center justify-center t-num text-[11px]">
        {n}
      </span>
      <p className="t-body text-ink">{children}</p>
    </div>
  )
}

/**
 * The lock, which is the biggest single difference from a World Cup pool and
 * the thing members ask about first.
 *
 * A bracket pool has ONE deadline for the whole tournament. A league has
 * thirty-eight, each at its own first kickoff, and only one matchweek is open
 * at a time — enforced in the database by
 * `enforce_league_prediction_before_lock` (migration 058), not in the screen.
 * Saying so here is the honest version of that rule; a member who cannot find
 * matchweek 30 in August should be able to read why.
 */
function LockCard() {
  return (
    <DetailCard title="When picks lock" className="mb-4">
      <div className="space-y-3 mt-3">
        <Step n="1">
          <strong>One matchweek at a time.</strong> Only the matchweek in progress accepts
          picks. You cannot work ahead, and nobody else can either.
        </Step>
        <Step n="2">
          <strong>It locks at the first kickoff.</strong> Not at a time somebody set — at the
          moment the first match of that matchweek starts.
        </Step>
        <Step n="3">
          <strong>The next one opens on its own.</strong> As soon as a matchweek locks, the
          following one is open. There is nothing to wait for and nobody has to open it.
        </Step>
      </div>
    </DetailCard>
  )
}

/** Fixture picking — Pick'em and Showdown, at whichever depth the pool chose. */
function FixtureCard({ depth, prices }: { depth: 'results' | 'scores'; prices: Props['prices'] }) {
  if (depth === 'results') {
    return (
      <DetailCard title="Every fixture" className="mb-4">
        <div className="mt-1">
          {/* ⚠ `prices.exact`, NOT `prices.result`. See the header — at Results
              depth the engine charges the top price for a correct call, and the
              old screen naming `result` here is the bug this file exists for. */}
          <PointsRow label="Correct result" value={prices.exact} />
        </div>
        <p className="t-body text-muted mt-3">
          You call each match Home, Draw or Away. Every fixture is worth the same, and there is
          nothing to gain from a bolder pick than the one you believe — a correct call is a
          correct call.
        </p>
      </DetailCard>
    )
  }

  return (
    <DetailCard title="Every fixture" className="mb-4">
      <div className="mt-1">
        <PointsRow label="Exact score" value={prices.exact} />
        <PointsRow label="Right winner, right margin" value={prices.goalDifference} />
        <PointsRow label="Right winner" value={prices.result} />
      </div>
      <p className="t-body text-muted mt-3">
        If it finishes 2-1: predicting 2-1 earns {formatNumber(prices.exact)}, 3-2 earns{' '}
        {formatNumber(prices.goalDifference)} (right winner, and you had the one-goal margin),
        2-0 earns {formatNumber(prices.result)} (right winner). Only the best tier you reach
        counts — they do not add up.
      </p>
    </DetailCard>
  )
}

/** Showdown's layer on top: the weekly duel. */
function DuelCard() {
  return (
    <DetailCard title="Your weekly duel" className="mb-4">
      <div className="mt-1">
        {/* Fixed in league_score_duels (084), not a pool setting — so these are
            literals rather than a lie about being configurable. */}
        <PointsRow label="Beat your opponent" value={3} />
        <PointsRow label="Tie with them" value={1} />
        <PointsRow label="Lose" value={0} />
      </div>
      <p className="t-body text-muted mt-3">
        Every matchweek you are drawn against one other member. Whoever scored more that week
        wins the duel. The fixture list is published in advance and everyone plays everyone the
        same number of times — with an odd number of entries, the bye rotates so nobody sits out
        twice before everyone has sat out once.
      </p>
      <p className="t-body text-muted mt-3">
        Duel points decide the table. Your matchweek points are the tiebreak, so a heavy week
        still counts for something even if you lost the head-to-head.
      </p>
    </DetailCard>
  )
}

/** Last Man Standing has no points ladder at all, which is worth saying plainly. */
function SurvivalCard({ clubCount }: { clubCount?: number | null }) {
  return (
    <DetailCard title="How you survive" className="mb-4">
      <div className="space-y-3 mt-3">
        <Step n="1">
          <strong>Pick one club a matchweek, to win.</strong> Not a scoreline and not a result —
          just a club you think wins.
        </Step>
        <Step n="2">
          <strong>They win, you go through.</strong> A draw or a defeat and you are out of the
          round.
        </Step>
        <Step n="3">
          <strong>You cannot use a club twice in a round.</strong>{' '}
          {clubCount
            ? `All ${clubCount} are available at the start of a round and each is spent once.`
            : 'Each club is spent once, so the easy ones run out.'}
        </Step>
        <Step n="4">
          <strong>A new round starts when the last one ends.</strong> Everybody goes back in,
          including whoever went out first — so an early exit in September does not mean
          watching until May.
        </Step>
      </div>
      <p className="t-body text-muted mt-4">
        There are no points in this mode. You are ranked by rounds won, and nothing else can
        move you up.
      </p>
    </DetailCard>
  )
}

/** Table mode — one decision, priced per club. */
function TableCard({ table }: { table: LeagueTablePrices }) {
  const full = table.profile === 'full_table'
  return (
    <>
      {full && (
        <DetailCard title="Every club you place" className="mb-4">
          <div className="mt-1">
            <PointsRow label="Exactly right" value={table.exactPoints} />
            <PointsRow label="Lost per place out" value={table.stepPenalty} />
          </div>
          <p className="t-body text-muted mt-3">
            A club placed exactly right is worth {formatNumber(table.exactPoints)}. Every place
            you are out costs {formatNumber(table.stepPenalty)} of that, so being one off is
            worth {formatNumber(Math.max(0, table.exactPoints - table.stepPenalty))} and being{' '}
            {Math.ceil(table.exactPoints / Math.max(1, table.stepPenalty))} or more out is worth
            nothing. It never goes negative.
          </p>
        </DetailCard>
      )}

      <DetailCard title="The places that matter most" className="mb-4">
        <DetailCaption>CALLED CORRECTLY</DetailCaption>
        <div>
          <PointsRow label="The champion" value={table.championBonus} />
          <PointsRow label={`Each of the top ${table.topN}`} value={table.topFourBonus} />
          <PointsRow label={`All ${table.topN}, as a set`} value={table.perfectTopFourBonus} />
          <PointsRow label={`Each of the bottom ${table.relegationN}`} value={table.relegationBonus} />
        </div>
        <p className="t-body text-muted mt-3">
          The top {table.topN} and the bottom {table.relegationN} are scored as{' '}
          <strong>sets, not orders</strong> — naming the right clubs earns the bonus even if you
          have them in the wrong order among themselves.
          {full
            ? ' This is on top of the per-place points above.'
            : ' This pool scores the bands only, so where you put everyone else does not affect your score.'}
        </p>
        <p className="t-body text-muted mt-3">
          The bands come from the competition itself rather than being assumed — a league with a
          different number of European places or relegation spots is scored on its own.
        </p>
      </DetailCard>
    </>
  )
}

/**
 * How the leaderboard breaks a tie.
 *
 * ⚠ Not editorial. This mirrors the ORDER BY in `league_finalize_ranks`, which
 * migrations 059, 084 and 087 have each edited:
 *
 *   rounds_won DESC, duel_points DESC, total_points DESC, exact_count DESC,
 *   correct_count DESC, bonus_points DESC, earliest league_predictions.created_at
 *
 * `rounds_won` and `duel_points` are 0 in every mode that does not use them, so
 * one ordering serves all four — but showing a Pick'em member a rung about
 * duels would be describing a rung that can never apply, so the leading two are
 * rendered only for the mode that owns them.
 *
 * ⚠ Rung 5 is the earliest FIRST PICK, not `pool_entries.predictions_submitted_at`
 * — that column stays NULL for every league entry by design, and it is one of
 * the two doors by which a league entry could reach the World Cup selectors.
 */
function TieBreakerCard({ mode, depth }: { mode: LeagueScoringMode; depth: Props['depth'] }) {
  const rungs: React.ReactNode[] = []

  // ⚠ ONLY RUNGS THAT CAN ACTUALLY SEPARATE TWO ENTRIES. The ORDER BY has seven
  // keys and applies them to all four modes, but several are constant within a
  // given mode, and a rung that is constant is not a tiebreak — printing it
  // would be the same class of untruth this whole screen replaced.
  //
  // Verified against the data, not inferred:
  //   * `rounds_won` and `duel_points` are 0 outside their own mode (084, 087).
  //   * `bonus_points` is written ONLY by league_score_table (080), so it is 0
  //     for Pick'em and Showdown — and in Table mode it is the WHOLE of
  //     total_points (match_points is 0 there), so as a second rung it can never
  //     break what the first did not.
  //   * The last rung reads `min(league_predictions.created_at)`. Last Man
  //     Standing writes `league_lms_picks` and Table writes
  //     `league_table_predictions`; neither writes a single row to
  //     `league_predictions`, so it is 'infinity' for everyone in those modes.
  //     Confirmed live 2026-08-24: 0 rows for all 16 entries across both pools.
  if (mode === 'last_man_standing') {
    rungs.push(
      <><strong>Rounds won.</strong> The only thing that ranks you — there are no points in
      this mode to separate you further.</>,
    )
  }

  if (mode === 'showdown') {
    rungs.push(
      <><strong>Duel points.</strong> Three a win, one a tie. This is the competition;
      everything below is the tiebreak.</>,
    )
  }

  if (mode === 'table') {
    rungs.push(<><strong>Total points.</strong> Your table, scored against the real one.</>)
  }

  if (mode === 'pickem' || mode === 'showdown') {
    rungs.push(<><strong>Total points.</strong> Everything you have scored across the season.</>)
    if (depth === 'scores') {
      rungs.push(<><strong>Most exact scores.</strong> The entry that called more scorelines exactly goes ahead.</>)
      rungs.push(<><strong>Most correct results.</strong> Then whoever got more results right, whatever the scoreline.</>)
    } else {
      rungs.push(<><strong>Most correct calls.</strong> Whoever got more results right across the season.</>)
    }
    rungs.push(
      <><strong>Who picked first.</strong> The entry whose first pick of the season landed
      earliest. An entry that has never picked always places behind one that has.</>,
    )
  }

  return (
    <DetailCard title={rungs.length > 1 ? 'Leaderboard tie-breakers' : 'How the leaderboard is ordered'} className="mb-4">
      <p className="t-body text-muted mt-3 mb-4">
        {rungs.length > 1
          ? 'When two entries are level, these are applied in order until one comes out ahead.'
          : 'This is the whole of it.'}
      </p>
      <div className="space-y-3">
        {rungs.map((r, i) => (
          <Step key={i} n={i + 1}>{r}</Step>
        ))}
      </div>
      <p className="t-body text-muted mt-4">
        {rungs.length > 1
          ? 'Entries still level after all of them genuinely share a rank — the leaderboard shows them on the same number rather than picking a winner arbitrarily.'
          : 'Entries that are still level genuinely share a rank. Nothing further is used to split them, because anything we could reach for here would be arbitrary rather than earned.'}
      </p>
    </DetailCard>
  )
}

export function LeagueScoringRulesTab({ mode, depth, prices, table, clubCount }: Props) {
  const showFixtures = (mode === 'pickem' || mode === 'showdown') && depth !== null

  return (
    <div>
      {showFixtures && <FixtureCard depth={depth} prices={prices} />}
      {mode === 'showdown' && <DuelCard />}
      {mode === 'last_man_standing' && <SurvivalCard clubCount={clubCount} />}
      {mode === 'table' && table && <TableCard table={table} />}

      {/* Table mode has ONE deadline for the season, not a weekly rhythm, so the
          lock card would be describing a cadence it does not have. */}
      {mode !== 'table' && <LockCard />}

      <TieBreakerCard mode={mode} depth={depth} />
    </div>
  )
}
