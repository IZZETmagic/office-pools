import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { LeagueFormLegend } from './LeaderboardLegend';
import { FormDots, MovementPill, rankColor } from './leaderboard-shared';
import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry, LeagueLeaderboardMeta } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// PICK'EM — the league mode that actually has a weekly record
// =============================================================
// Before this file, a Pick'em pool on the phone said **"No Entries Yet — the
// leaderboard will appear once entries are submitted."** Not zeros: a flat
// denial that anybody was playing. `usePoolDetail` empties the World Cup list
// for every league pool, and only Table and Last Man Standing had a list of
// their own, so Pick'em fell through to the empty state while production held
// eight scored entries ranked 1–8 on 500/400/300/300/200/100/100/100 points.
//
// ## Why it is not just the World Cup row with fewer fields
//
// Pick'em is the RICHEST league mode, and the opposite problem to Table. Table
// had to drop seven facts; here most of them are real:
//
//   rank + movement   real — the engine ranks Pick'em properly, unlike LMS where
//                     every rung of the cascade is zero and rank is entry_id order
//   total             real
//   form dots         real — `league_match_scores.score_type` already speaks the
//                     exact vocabulary `FormDots` renders
//   correct / exact   real, and `exact` ONLY at Scores depth
//
// What stays off: the base/bonus split (`bonus_points` is structurally 0 in this
// mode — the total IS the match points, so "500 + 0" is noise dressed as
// detail), hit rate, XP, level and awards (the league outbox BLOCKS the XP
// writer rather than running it against zero rows, so there is nothing to show
// and a "Level 1" pill would be unearned).
//
// ## ⚠ The depth fork is real, not cosmetic
//
// Pick'em ships at two depths and BOTH are in production. At Scores depth the
// engine emits `exact` / `winner_gd` / `winner` / `miss`; at Results depth it
// emits `winner` / `miss` and nothing else. So the legend shrinks and the exact
// count disappears — `exact_count` arrives NULL rather than 0 for exactly this
// reason. A "0 exact" under a Results pool reads as failing at something the
// game never asked for.
//
// ⚠ Every depth test is `=== 'results'`. NULL depth is Scores.
// =============================================================

type Props = {
  entries: LeagueLeaderboardEntry[];
  league: LeagueLeaderboardMeta;
  currentUserId: string | null;
  onEntryPress?: (entry: LeagueLeaderboardEntry) => void;
};

export function LeaguePickemLeaderboard({ entries, league, currentUserId, onEntryPress }: Props) {
  const theme = useTheme();

  if (entries.length === 0) {
    return (
      <View
        style={{
          paddingVertical: theme.spacing.hero,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="sectionHeader" align="center">
          No Entries Yet
        </Text>
        <Text variant="body" color="slate" align="center">
          The leaderboard fills up once the first matchweek is scored.
        </Text>
      </View>
    );
  }

  const hasPodium = entries.length >= 3;
  const rest = hasPodium ? entries.slice(3) : entries;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <SettlementNote isFinal={league.is_final} />

      {hasPodium ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
          }}
        >
          <PodiumColumn
            entry={entries[1]}
            pedestalHeight={110}
            ringColor={theme.colors.silver}
            bgTint={withOpacity(theme.colors.silver, 0.15)}
            medalIcon="medal.fill"
            isCurrentUser={entries[1].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[1]) : undefined}
          />
          <PodiumColumn
            entry={entries[0]}
            pedestalHeight={136}
            ringColor={theme.colors.accent}
            bgTint={withOpacity(theme.colors.accent, 0.1)}
            medalIcon="trophy.fill"
            isCurrentUser={entries[0].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[0]) : undefined}
          />
          <PodiumColumn
            entry={entries[2]}
            pedestalHeight={92}
            ringColor={theme.colors.bronze}
            bgTint={withOpacity(theme.colors.bronze, 0.1)}
            medalIcon="medal.fill"
            isCurrentUser={entries[2].user_id === currentUserId}
            onPress={onEntryPress ? () => onEntryPress(entries[2]) : undefined}
          />
        </View>
      ) : null}

      <LeagueFormLegend depth={league.depth} />

      {rest.map((entry, i) => (
        <PickemRow
          key={entry.entry_id}
          entry={entry}
          rank={entry.current_rank ?? (hasPodium ? 4 : 1) + i}
          isCurrentUser={entry.user_id === currentUserId}
          onPress={onEntryPress ? () => onEntryPress(entry) : undefined}
        />
      ))}
    </View>
  );
}

/**
 * ⚠ Same rule as Table mode. Pick'em scores every matchweek for 38 weeks, so a
 * leaderboard in October is a position, not a result. Saying so is the
 * difference between reporting and claiming.
 */
function SettlementNote({ isFinal }: { isFinal: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <Icon name={isFinal ? 'checkmark.seal.fill' : 'clock'} color={isFinal ? 'green' : 'slate'} size={11} />
      <Text variant="caption" color="slate" style={{ textTransform: 'none', letterSpacing: 0 }}>
        {isFinal ? 'Final — the season is settled' : 'Standing so far — settles when the season ends'}
      </Text>
    </View>
  );
}

/**
 * How they have actually been picking.
 *
 * ⚠ THE TWO DEPTHS SAY DIFFERENT SENTENCES, and the null is what decides it —
 * not a re-derivation from the pool's depth here, because that is the polarity
 * that has been got wrong three times. The server already made the call.
 *
 * ⚠ Nothing renders when they have not been scored yet. "0 correct" before a
 * ball is kicked is the confident zero this whole surface exists to avoid.
 */
function ScoreLine({
  entry,
  align = 'left',
}: {
  entry: LeagueLeaderboardEntry;
  align?: 'left' | 'center';
}) {
  const p = entry.pickem;
  if (!p || p.last_five.length === 0) return null;

  const exact = p.exact_count !== null ? ` · ${p.exact_count} exact` : '';
  return (
    <Text
      variant="detail"
      color="slate"
      align={align === 'center' ? 'center' : undefined}
      numberOfLines={1}
    >
      {p.correct_count} correct
      {exact}
    </Text>
  );
}

function PodiumColumn({
  entry,
  pedestalHeight,
  ringColor,
  bgTint,
  medalIcon,
  isCurrentUser,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  pedestalHeight: number;
  ringColor: string;
  bgTint: string;
  medalIcon: string;
  isCurrentUser: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: theme.spacing.xs,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: '100%', alignItems: 'center', height: 60, justifyContent: 'center' }}>
        <View
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            borderWidth: 3,
            borderColor: ringColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={medalIcon as never} color="slate" size={22} />
        </View>
        <MovementPill entry={entry} floating />
      </View>

      <Text variant="caption" color={isCurrentUser ? 'primary' : 'ink'} align="center" numberOfLines={1}>
        {name}
      </Text>
      <Text variant="detail" color="slate" numberOfLines={1}>
        @{entry.username}
      </Text>
      {/* ⚠ No streak passed. `current_streak` is World Cup analytics and is never
          written for a league entry — an absent prop draws nothing, where a
          zeroed one would draw a cold streak nobody is on. */}
      <FormDots results={entry.pickem?.last_five ?? []} size={7} />

      <View
        style={{
          alignSelf: 'stretch',
          height: pedestalHeight,
          borderRadius: theme.radii.md,
          backgroundColor: bgTint,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: theme.spacing.sm,
          gap: 4,
        }}
      >
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 22,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
        <ScoreLine entry={entry} align="center" />
      </View>
    </Pressable>
  );
}

function PickemRow({
  entry,
  rank,
  isCurrentUser,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  rank: number;
  isCurrentUser: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const rankFg = rankColor(rank, theme);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // Matches LeaderboardRow's current-user treatment exactly, including the
        // pre-blended Android hexes — see the note there for why alpha over
        // elevation reads as a double ring on Android.
        backgroundColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#E2E6FA'
            : withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        borderWidth: isCurrentUser ? (Platform.OS === 'android' ? 2 : theme.borders.accent) : 0,
        borderColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#B1BDF1'
            : withOpacity(theme.colors.primary, 0.25)
          : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ width: 36, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 14,
            fontWeight: '900',
            color: rankFg,
          }}
        >
          #{rank}
        </RNText>
        <MovementPill entry={entry} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {isCurrentUser ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.primary,
                  letterSpacing: 0.5,
                }}
              >
                YOU
              </RNText>
            </View>
          ) : null}
        </View>
        <Text variant="detail" color="slate">
          @{entry.username}
        </Text>
        <FormDots results={entry.pickem?.last_five ?? []} />
      </View>

      <View style={{ alignItems: 'flex-end', gap: 2 }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 17,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
        <ScoreLine entry={entry} />
      </View>

      {/* ⚠ Only when there is somewhere to go. `/pool/[id]/breakdown` is
          World-Cup-only — it reads `matches` and `match_conduct` for the pool's
          placeholder tournament — so a chevron on a league row would promise a
          screen that answers zero. The affordance appears when the destination
          does, not before. */}
      {onPress ? <Icon name="chevron.right" color="slate" size={11} /> : null}
    </Pressable>
  );
}
