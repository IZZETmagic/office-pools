import { ActivityIndicator, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { LmsState } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// LAST MAN STANDING — the Scoring tab
// =============================================================
// The World Cup Scoring tab lists group bonuses, bracket pairings, a top-scorer
// award and points per exact scoreline. This mode awards NONE of them: it has no
// points at all. So the tab was not merely unfinished for an LMS pool, it was
// describing a different game — the same pattern every league tab has produced.
//
// The content mirrors the web's `LeagueScoringRulesTab` for this mode, with two
// deliberate departures, both because the web is now wrong:
//
// ⚠ 1. THE LOCK IS AN HOUR BEFORE KICKOFF, NOT AT IT. The web's LockCard says
//    *"at the moment the first match of that matchweek starts"*. Migration 101
//    moved it and backfilled: measured on production 2026-09-03, MW3 onward run
//    a 60-minute gap between `lock_at` and `first_kickoff_at`. (MW1 and MW2 sit
//    at zero because they had already locked when 101 ran, and a passed deadline
//    is never moved.) An hour is enough to matter to somebody picking late.
//
// ⚠ 2. TIES DO NOT "GENUINELY SHARE A RANK" HERE. The web says nothing further
//    splits level entries. `league_finalize_ranks` does: with `rounds_won`,
//    `duel_points` and every points rung at zero, and the "picked first" rung at
//    infinity (LMS writes `league_lms_picks`, never `league_predictions`), the
//    cascade falls through to `entry_id ASC`. Verified on production — all ten
//    stored ranks matched entry_id order. So this screen says what the phone's
//    leaderboard actually does instead of repeating a claim the data refutes.
// =============================================================

type Props = {
  state: LmsState | null;
  loading: boolean;
  error: string | null;
};

export function LmsScoring({ state, loading, error }: Props) {
  const theme = useTheme();

  if (loading && !state) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.xl }}>
        <Text variant="body" color="slate" align="center">
          {error}
        </Text>
      </View>
    );
  }

  const clubCount = state?.clubs.length ?? 0;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.md,
      }}
    >
      <RuleCard
        title="How you survive"
        steps={[
          ['Pick one club a matchweek, to win.', 'Not a scoreline and not a result — just a club you think wins.'],
          ['They win, you go through.', 'A draw or a defeat and you are out of the round.'],
          [
            'You cannot use a club twice in a round.',
            clubCount > 0
              ? `All ${clubCount} are available at the start of a round and each is spent once — so the easy ones run out.`
              : 'Each club is spent once, so the easy ones run out.',
          ],
          [
            'A new round starts when the last one ends.',
            'Everybody goes back in, including whoever went out first — so an early exit in September does not mean watching until May.',
          ],
        ]}
        footer="There are no points in this mode. You are ranked by rounds won, and nothing else can move you up."
      />

      <RuleCard
        title="When picks lock"
        steps={[
          [
            'One matchweek at a time.',
            'Only the matchweek in progress accepts picks. You cannot work ahead, and nobody else can either.',
          ],
          [
            'An hour before the first kickoff.',
            'Not a time somebody set — one hour before the first match of that matchweek starts.',
          ],
          [
            'The next one opens on its own.',
            'As soon as a matchweek locks, the following one is open. There is nothing to wait for and nobody has to open it.',
          ],
          [
            'Everyone’s picks appear at the lock.',
            'Until then only you can see yours — otherwise the pool could just copy whoever is playing best.',
          ],
        ]}
      />

      <RuleCard
        title="How the leaderboard is ordered"
        intro="This is the whole of it — there are no points to separate you further."
        steps={[
          [
            'Rounds won.',
            'The only thing that ranks you across the season. A round win is the only thing that survives a round ending.',
          ],
          [
            'Then this round: who is still standing.',
            'Level on rounds won, whoever is still in comes first — then whoever lasted longer before going out.',
          ],
        ]}
        // ⚠ Said plainly rather than claimed away. The stored rank falls through
        // to entry_id in this mode, so a screen promising a shared rank would be
        // promising something the database does not do.
        footer="Two people level on both are genuinely level. The order between them carries no meaning — nothing further is used to split them, because anything we could reach for would be arbitrary rather than earned."
      />

      <RuleCard
        title="A club with no game"
        steps={[
          [
            'You survive the week.',
            'If the club you backed has no fixture — or the match is called off and never played — you were not beaten, so you go through.',
          ],
          [
            'But you have still spent it.',
            'That club is gone for the rest of the round, which is the price of a week that cost you nothing.',
          ],
          [
            'No pick is not the same thing.',
            'Nobody picks for you. A matchweek that locks with no pick from you is an elimination.',
          ],
        ]}
      />
    </View>
  );
}

function RuleCard({
  title,
  intro,
  steps,
  footer,
}: {
  title: string;
  intro?: string;
  steps: Array<[string, string]>;
  footer?: string;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      <Text variant="cardTitle">{title}</Text>
      {intro ? (
        <Text variant="detail" color="slate">
          {intro}
        </Text>
      ) : null}

      <View style={{ gap: theme.spacing.sm, marginTop: 2 }}>
        {steps.map(([lead, rest], i) => (
          <View key={lead} style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withOpacity(theme.colors.primary, 0.12),
                marginTop: 1,
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: theme.colors.primary }}>
                {i + 1}
              </RNText>
            </View>
            <View style={{ flex: 1 }}>
              <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 19, color: theme.colors.slate }}>
                <RNText style={{ fontFamily: fontFamilies.bold, color: theme.colors.ink }}>{lead}</RNText>{' '}
                {rest}
              </RNText>
            </View>
          </View>
        ))}
      </View>

      {footer ? (
        <Text variant="detail" color="slate" style={{ marginTop: 2 }}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}
