import { ActivityIndicator, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { DUEL_BYE, DUEL_LOSS, DUEL_TIE, DUEL_WIN } from '@/lib/duelPoints';
import { useLeaguePool } from '@/lib/useLeaguePool';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// PICK'EM — the Scoring tab
// =============================================================
// The World Cup Scoring tab lists group bonuses, a ×8 Final multiplier, penalty
// shootouts, "the 32 qualifying teams" and a 1,000-point Champion bonus. A
// league pool can score none of it. The same pattern every league tab has
// produced: not unfinished, describing a different game.
//
// ## ⚠⚠ THE ONE LINE THAT WAS WORSE THAN IRRELEVANT
//
// At RESULTS depth the engine charges a correct tap at `group_exact_score` —
// the pool's TOP price, 100 by default. Migration 066 says why: *"getting the
// outcome right is the most that can be achieved, so the top price is the
// semantically right one to charge it at."*
//
// The World Cup screen showed that same 100 under the label "Exact Score", and
// "Correct Result — 50 pts" directly beneath it. So a member in a Results pool
// who called Arsenal to win read that their pick was worth 50. **It is worth
// 100.** That is the defect this screen closes on the phone, and the reason the
// depth is read before the prices are.
//
// ## ⚠ THE LOCK IS AN HOUR BEFORE KICKOFF
//
// Migration 101 moved it and backfilled. Measured on production 2026-09-03:
// matchweek 3 onward run a 60-minute gap between `lock_at` and
// `first_kickoff_at`; matchweeks 1 and 2 sit at zero because they had already
// locked when 101 ran, and a passed deadline is never moved.
//
// ⚠ The WEB still says otherwise — `LeagueScoringRulesTab`'s LockCard tells
// members picks close *"at the moment the first match of that matchweek
// starts"*. Stale by an hour, today. Recorded here rather than copied.
//
// ## Every number is READ
//
// The prices come over the league contract from `pool_settings.group_*` — the
// same columns `league_score_fixture` COALESCEs against (055/066). A pool that
// prices its fixtures differently gets its own numbers here, and nothing on
// this screen can drift into describing scoring nobody is using.
// =============================================================

type Props = {
  poolId: string;
  /**
   * Add the duel layer — Showdown only.
   *
   * ⚠ SHOWDOWN IS A PICK'EM WITH A LAYER ON TOP (Decision 9), not a separate
   * game, so it gets this whole screen and one more card rather than a screen
   * of its own. `league_score_duels` reads the same weekly total this page
   * prices; it never learns which depth produced it.
   *
   * Until now a Showdown pool fell through to the WORLD CUP scoring tab —
   * group bonuses, a ×8 Final multiplier, penalty shootouts and a 1,000-point
   * Champion bonus, none of which it can score, over the Results-depth pricing
   * error this screen exists to fix.
   */
  showDuel?: boolean;
};

export function LeaguePickemScoring({ poolId, showDuel = false }: Props) {
  const theme = useTheme();
  const league = useLeaguePool(poolId);

  if (league.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (league.isError || !league.data) {
    return (
      <View style={{ paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.xl }}>
        <Text variant="body" color="slate" align="center">
          {league.error instanceof Error ? league.error.message : 'The rules could not be loaded.'}
        </Text>
      </View>
    );
  }

  const { prices, league_depth } = league.data.pool;
  // ⚠ `=== 'results'` and nothing else. A NULL depth is Scores, byte for byte
  // with the engine (066); the opposite polarity has shipped three times on web
  // and tells members they are playing a game they are not being scored at.
  const isResults = league_depth === 'results';

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <Card
        title={isResults ? 'Every match you call' : 'Every match you predict'}
        caption={
          isResults
            ? 'You tap a winner, or a draw. There is one way to be right and one price for it.'
            : 'You predict the score. Only the best tier you reach is paid — they do not stack.'
        }
      >
        {isResults ? (
          /* ⚠ `prices.exact`, NOT `prices.result` — see the header. This is the
             line the World Cup screen got wrong by half. */
          <PointsRow label="Correct result" value={prices.exact} />
        ) : (
          <>
            <PointsRow label="Exact score" value={prices.exact} />
            <PointsRow label="Right winner, right margin" value={prices.goalDifference} />
            <PointsRow label="Right winner" value={prices.result} />
          </>
        )}
      </Card>

      {!isResults ? (
        <Note>
          If it finishes 2–1: predicting 2–1 earns {fmt(prices.exact)}, 3–2 earns{' '}
          {fmt(prices.goalDifference)} — right winner, and you had the one-goal margin — and 2–0
          earns {fmt(prices.result)} for the right winner. Only the best tier you reach counts.
        </Note>
      ) : (
        <Note>
          A correct call is worth {fmt(prices.exact)} whichever way the match goes. Backing a draw
          pays the same as backing a win.
        </Note>
      )}

      {/*
        THE DUEL LAYER — Showdown only.

        ⚠ THE VALUES ARE IMPORTED, NEVER TYPED OUT. They are fixed in
        `league_score_duels` (migration 121) rather than being a pool setting,
        and `duelPoints.guard.test.ts` reads both the web and mobile copies
        against the migration — so a screen quoting a literal would drift
        silently the next time the scale moves. It has moved once already:
        3/1/0 became 500/250/0.
      */}
      {showDuel ? (
        <Card
          title="Your weekly duel"
          caption="Every matchweek you are drawn against one other member. Whoever scored more that week wins the duel."
        >
          <PointsRow label="Beat your opponent" value={DUEL_WIN} />
          <PointsRow label="Tie with them" value={DUEL_TIE} />
          <PointsRow label="No opponent this week" value={DUEL_BYE} />
          <PointsRow label="Lose" value={DUEL_LOSS} />
        </Card>
      ) : null}

      {showDuel ? (
        <>
          {/*
            ⚠ ONE TABLE, NOT TWO. Migration 121 changed `league_finalize_ranks`
            from ranking duel points AHEAD of accuracy to ADDING them to it. The
            old sentence — "duel points decide the table, the weekly score is
            the tiebreak" — describes a cascade that no longer exists.
          */}
          <Note>
            There is one table. Your duel points are added to what your picks scored, so a heavy
            week still counts even if you lost the head-to-head — and a win, at about half a
            perfect matchweek, moves you further than any single result can.
          </Note>
          {/*
            ⚠ THE COPY MUST NEVER SAY A PAIRING HAPPENS EACH WEEK. The whole
            season is drawn at pool creation; only the SHOWING is weekly. That
            is the one sentence here that would fail the disclosure gate,
            because it is a claim about something we did not do.
          */}
          <Note>
            The whole season is drawn when the pool is created, and each opponent is revealed two
            days after the previous duel is decided — one duel at a time. The draw rotates, so
            everybody meets everybody. With an odd number of entries somebody sits out each week
            and takes {fmt(DUEL_BYE)}: there was no opponent, so there was no defeat.
          </Note>
          <Note>
            Joining after the season has started means fewer duels than the members who were here
            from the start, and fewer points to show for them.
          </Note>
        </>
      ) : null}

      <Card
        title="Picks close an hour before kickoff"
        caption="Not at kickoff — an hour before the first match of the matchweek. Everyone's picks become visible at that moment, which buys an hour of arguing about them before a ball is kicked."
      />

      <Card
        title="One matchweek at a time"
        caption="Exactly one matchweek is open for picks. It is the one that LOCKS NEXT, which is not always the lowest number left — a whole round can be moved, and across three real Premier League seasons that happens most years."
      />

      <Card
        title="If you miss a matchweek"
        caption="You score nothing for the fixtures you did not pick, and nothing else happens. There is no penalty and no elimination — the matchweek simply passes, and the next one opens as usual."
      />

      {/*
        ⚠ READ OFF `league_finalize_ranks`' OWN ORDER BY (121), not written from
        memory — the LMS pass caught this screen's sibling claiming a cascade
        the data refuted. For Pick'em `rounds_won`, `duel_points` and
        `bonus_points` are all structurally 0, so the live rungs are:
        total_points → exact_count → correct_count → earliest pick → entry_id.

        ⚠ AND `exact_count` IS 0 FOR EVERYONE AT RESULTS DEPTH — the engine
        writes only `winner` or `miss` there — so naming it as a tiebreak in a
        Results pool would describe a rung that can never separate anybody.

        ⚠ The last rung is who PICKED first, NOT who joined first. It reads
        `min(league_predictions.created_at)`; `predictions_submitted_at` stays
        NULL for every league entry by design.
      */}
      <Card
        title="Level scores"
        caption={
          isResults
            ? 'Ranked on total points, then how many results you called right. Still level? Whoever got their picks in first is placed above — and after that the order is fixed, so a re-score never reshuffles it.'
            : 'Ranked on total points, then exact scores, then correct results. Still level? Whoever got their picks in first is placed above — and after that the order is fixed, so a re-score never reshuffles it.'
        }
      />
    </View>
  );
}

function Card({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      <Text variant="cardTitle">{title}</Text>
      <Text variant="body" color="slate">
        {caption}
      </Text>
      {children ? <View style={{ gap: 2, paddingTop: theme.spacing.xs }}>{children}</View> : null}
    </View>
  );
}

function PointsRow({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 7,
        borderTopWidth: 1,
        borderTopColor: withOpacity(theme.colors.slate, 0.12),
      }}
    >
      <Text variant="body">{label}</Text>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 15,
          color: theme.colors.primary,
        }}
      >
        {fmt(value)}
      </RNText>
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.xs }}>
      {/* ⚠ `info.circle.fill`. Plain `info.circle` is NOT in the Hugeicons
          map — an unmapped name renders nothing and throws nothing. */}
      <Icon name="info.circle.fill" color="slate" size={13} />
      <Text variant="detail" color="slate" style={{ flex: 1, fontSize: 12, lineHeight: 17 }}>
        {children}
      </Text>
    </View>
  );
}

function fmt(n: number): string {
  return n.toLocaleString();
}
