// One settled matchweek in one league pool, as a sentence: "14 pts, up 3 to
// 4th". Built server-side (lib/activity/matchweekStories.ts); this only draws it.
//
// Tapping the card opens the detail in place. "Open" goes to the screen the
// week happened on — the picks, the duel, or the survivor wall.

import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { ActivityItem, MatchweekStoryMeta } from '@/lib/useActivity';
import { fontFamilies, useTheme } from '@/theme';

import { relativeTime } from './ActivityCard';

const MODE_LABEL: Record<MatchweekStoryMeta['league_mode'], string> = {
  pickem: "Pick'em",
  showdown: 'Showdown',
  last_man_standing: 'Last One Standing',
  table: 'Table',
};

export function MatchweekStoryCard({
  item,
  onOpen,
}: {
  item: ActivityItem;
  onOpen: (() => void) | null;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const m = item.metadata as unknown as MatchweekStoryMeta;
  if (!m) return null;

  const tiers = m.tiers;
  const tierTotal = tiers ? tiers.exact + tiers.winner_gd + tiers.winner + tiers.miss : 0;
  const segments = tiers
    ? [
        { n: tiers.exact, color: theme.colors.tierExact, label: 'exact' },
        { n: tiers.winner_gd, color: theme.colors.tierWinnerGd, label: 'winner+GD' },
        { n: tiers.winner, color: theme.colors.tierWinner, label: 'winner' },
        { n: tiers.miss, color: theme.colors.tierMiss, label: 'miss' },
      ].filter((s) => s.n > 0)
    : [];
  const detailRows = buildDetail(m);
  const hasDetail = detailRows.length > 0;
  const accent =
    item.colorKey === 'success'
      ? theme.colors.green
      : item.colorKey === 'accent'
        ? theme.colors.tierExact
        : theme.colors.ink;

  return (
    <Pressable
      onPress={hasDetail ? () => setOpen((o) => !o) : (onOpen ?? undefined)}
      accessibilityRole="button"
      accessibilityState={hasDetail ? { expanded: open } : undefined}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        padding: theme.spacing.md + 2,
        gap: theme.spacing.sm + 2,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      {!item.isRead ? (
        <View
          style={{
            position: 'absolute',
            left: 6,
            top: 20,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.primary,
          }}
        />
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: theme.spacing.sm }}>
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: theme.colors.slate,
          }}
        >
          {/* No matchweek here: the history's group heading already says it. */}
          {m.pool_name}
        </RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: theme.colors.slate }}>
          {MODE_LABEL[m.league_mode] ?? ''} · {relativeTime(item.createdAt)}
        </RNText>
      </View>

      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 19, lineHeight: 23, color: accent }}>
        {item.title}
      </RNText>

      {segments.length > 0 && tierTotal > 0 ? (
        <View style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', gap: 2 }}>
            {segments.map((s) => (
              <View key={s.label} style={{ flex: s.n, backgroundColor: s.color }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm + 2 }}>
            {segments.map((s) => (
              <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: s.color }} />
                <RNText
                  style={{ fontFamily: fontFamilies.semibold, fontSize: 11, color: theme.colors.slate }}
                >
                  {s.n} {s.label}
                </RNText>
              </View>
            ))}
          </View>
        </View>
      ) : item.body ? (
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
          {item.body}
        </RNText>
      ) : null}

      {open && hasDetail ? (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: theme.colors.mist,
            paddingTop: theme.spacing.sm + 2,
            gap: 6,
          }}
        >
          {detailRows.map((r, i) => (
            <View key={`${r.label}-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
              <RNText
                numberOfLines={1}
                style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.ink }}
              >
                {r.label}
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 13,
                  color: theme.colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {r.value}
              </RNText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        {hasDetail ? (
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}>
            {open ? 'Hide' : 'Details'}
          </RNText>
        ) : (
          <View />
        )}
        {onOpen ? (
          <Pressable
            onPress={onOpen}
            hitSlop={10}
            accessibilityRole="link"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}>
              {openLabel(m.league_mode)}
            </RNText>
            <Icon name="chevron.right" tint={theme.colors.primary} size={11} weight="bold" />
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function openLabel(mode: MatchweekStoryMeta['league_mode']): string {
  switch (mode) {
    case 'showdown':
      return 'See the duel';
    case 'last_man_standing':
      return 'See who is left';
    case 'table':
      return 'See your table';
    default:
      return 'See your picks';
  }
}

/** The rows under "Details". Empty means the card has nothing to expand. */
function buildDetail(m: MatchweekStoryMeta): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = []
  const plus = (n: number) => `+${n.toLocaleString('en-GB')}`

  if (m.duel) {
    if (m.duel.my_accuracy != null) rows.push({ label: 'Your accuracy', value: m.duel.my_accuracy.toLocaleString('en-GB') })
    if (m.duel.their_accuracy != null && m.duel.opponent_name) {
      rows.push({ label: `${m.duel.opponent_name}'s accuracy`, value: m.duel.their_accuracy.toLocaleString('en-GB') })
    }
    rows.push({ label: 'Duel points', value: plus(m.duel.duel_points) })
  }
  for (const l of m.lines) rows.push({ label: l.label, value: plus(l.points) })
  if (m.more_count > 0) {
    rows.push({
      label: `${m.more_count} more match${m.more_count === 1 ? '' : 'es'}`,
      value: plus(m.more_points),
    })
  }
  if (m.lms) {
    rows.push({ label: 'Your pick', value: m.lms.club_name })
    rows.push({ label: `Still in round ${m.lms.round_number}`, value: `${m.lms.survivors_left} of ${m.lms.round_entrants}` })
  }
  if (m.rank != null && m.entrants != null) {
    rows.push({ label: 'Standing after the week', value: `${m.rank} of ${m.entrants}` })
  }
  return rows
}
