// Port of ios/OfficePools/Views/Activity/ActivityCardView.swift.

import { Image, Text as RNText, View } from 'react-native';

import { badgeIconByName } from '@/components/pool-detail/badge-icons';
import { Icon, Text } from '@/components/ui';
import type {
  ActivityColorKey,
  ActivityItem,
  BadgeEarnedMeta,
  LevelUpMeta,
  MatchdayMvpMeta,
  MatchdayRecapMeta,
  PointsAdjustedMeta,
  PredictionResultMeta,
  PredictionSubmittedMeta,
  RankChangeMeta,
  StreakMilestoneMeta,
  XPGainMeta,
} from '@/lib/useActivity';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type ActivityCardProps = {
  item: ActivityItem;
};

export function ActivityCard({ item }: ActivityCardProps) {
  const theme = useTheme();
  const colorKey = resolveColorKey(item);
  const iconName = resolveIcon(item);
  const isEmoji = isEmojiIcon(iconName);
  const bg = iconBg(theme, colorKey);
  const fg = iconFg(theme, colorKey);
  const poolName = readPoolName(item);

  // For badge_earned items, swap the colored emoji chip for the badge's
  // PNG medallion when we can resolve one from the badge name. Falls
  // through to the existing chip+emoji path otherwise (so unknown
  // names — e.g. a freshly-added badge whose mapping hasn't shipped
  // yet — still render something).
  const badgePng =
    item.activityType === 'badge_earned'
      ? badgeIconByName(
          ((item.metadata as { badge_name?: unknown } | null)?.badge_name as
            | string
            | undefined) ?? '',
        )?.png ?? null
      : null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
        paddingLeft: 0,
        paddingRight: theme.spacing.md + 2,
        paddingVertical: theme.spacing.md + 2,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
      }}
    >
      {/* Unread indicator */}
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          marginTop: 10,
          backgroundColor: item.isRead ? 'transparent' : theme.colors.primary,
        }}
      />

      {/* Icon circle. badge_earned items with a resolvable PNG render
          the medallion directly with a transparent background so the
          trophy is the visual anchor; everything else keeps the
          colored emoji/SF-symbol chip. */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: badgePng ? 'transparent' : bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {badgePng ? (
          <Image source={badgePng} style={{ width: 38, height: 38 }} resizeMode="contain" />
        ) : isEmoji ? (
          <RNText style={{ fontSize: 16 }}>{iconName}</RNText>
        ) : (
          <Icon name={iconName as never} tint={fg} size={15} weight="semibold" />
        )}
      </View>

      {/* Content */}
      <View style={{ flex: 1, gap: 5 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 4 }}>
          <RNText
            numberOfLines={2}
            style={{
              flex: 1,
              fontFamily: item.isRead ? fontFamilies.medium : fontFamilies.semibold,
              fontSize: 14,
              color: theme.colors.ink,
            }}
          >
            {item.title}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 10,
              color: theme.colors.slate,
            }}
          >
            {relativeTime(item.createdAt)}
          </RNText>
        </View>

        {item.body ? (
          <RNText
            numberOfLines={2}
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            {item.body}
          </RNText>
        ) : null}

        <DetailRow item={item} />

        {poolName ? <PoolChip name={poolName} /> : null}
      </View>
    </View>
  );
}

// --- Type-specific detail rows ----------------------------------------

function DetailRow({ item }: { item: ActivityItem }) {
  const theme = useTheme();
  const md = item.metadata ?? {};

  switch (item.activityType) {
    case 'rank_change': {
      const m = md as unknown as RankChangeMeta;
      if (typeof m.delta !== 'number') return null;
      const positive = m.delta > 0;
      const color = positive ? theme.colors.green : theme.colors.red;
      const abs = Math.abs(m.delta);
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name={positive ? 'arrow.up' : 'arrow.down'} tint={color} size={10} weight="bold" />
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color }}>
            {abs} position{abs === 1 ? '' : 's'}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
              textDecorationLine: 'line-through',
            }}
          >
            #{m.old_rank}
          </RNText>
          <Icon name="arrow.right" tint={theme.colors.mist} size={8} weight="regular" />
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 11, color: theme.colors.ink }}>
            #{m.new_rank}
          </RNText>
        </View>
      );
    }
    case 'prediction_result': {
      // Score is already rendered as the card title. DetailRow only carries
      // the outcome chip + optional match-number tag.
      const m = md as unknown as PredictionResultMeta;
      if (!m.outcome) return null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <OutcomeChip outcome={m.outcome} />
          {m.match_number ? (
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
            >
              Match {m.match_number}
            </RNText>
          ) : null}
        </View>
      );
    }
    case 'streak_milestone': {
      const m = md as unknown as StreakMilestoneMeta;
      if (!m.streak_length) return null;
      const isHot = m.streak_type === 'hot';
      const color = isHot ? theme.colors.amber : theme.colors.primary;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {Array.from({ length: m.streak_length }).map((_, i) => (
            <Icon
              key={i}
              name={isHot ? 'flame.fill' : 'snowflake'}
              tint={color}
              size={10}
              weight="regular"
            />
          ))}
        </View>
      );
    }
    case 'badge_earned': {
      const m = md as unknown as BadgeEarnedMeta;
      if (!m.badge_name) return null;
      const rare = rarityColor(theme, m.rarity);
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RNText style={{ fontSize: 12 }}>{m.badge_emoji}</RNText>
          <RNText
            style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.ink }}
          >
            {m.badge_name}
          </RNText>
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 999,
              backgroundColor: withOpacity(rare, 0.12),
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: rare }}>
              {m.rarity}
            </RNText>
          </View>
        </View>
      );
    }
    case 'level_up': {
      const m = md as unknown as LevelUpMeta;
      if (!m.new_level) return null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RNText
            style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: levelColor(theme, m.new_level) }}
          >
            Level {m.new_level}
          </RNText>
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
          >
            {m.level_name}
          </RNText>
        </View>
      );
    }
    case 'matchday_mvp': {
      const m = md as unknown as MatchdayMvpMeta;
      if (m.match_points == null) return null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <RNText
            style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.accent }}
          >
            {m.match_points} pts
          </RNText>
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
          >
            Match {m.match_number}
          </RNText>
        </View>
      );
    }
    case 'prediction_submitted': {
      const m = md as unknown as PredictionSubmittedMeta;
      if (!m.entry_name && !m.match_count) return null;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {m.entry_name ? (
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.ink }}
            >
              {m.entry_name}
            </RNText>
          ) : null}
          {m.match_count != null ? (
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
            >
              {m.match_count} matches
            </RNText>
          ) : null}
          <Icon name="checkmark.seal.fill" tint={theme.colors.green} size={12} weight="regular" />
        </View>
      );
    }
    case 'matchday_recap': {
      const m = md as unknown as MatchdayRecapMeta;
      if (m.matches == null) return null;
      const chips: Array<{ label: string; color: string }> = [];
      if (m.exact > 0) chips.push({ label: `${m.exact} Exact`, color: theme.colors.accent });
      if (m.winner_gd > 0) chips.push({ label: `${m.winner_gd} GD`, color: theme.colors.green });
      if (m.winner > 0) chips.push({ label: `${m.winner} Winner`, color: theme.colors.primary });
      if (m.miss > 0) chips.push({ label: `${m.miss} Miss`, color: theme.colors.slate });
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.ink }}>
            +{m.points} pts
          </RNText>
          {chips.map((c) => (
            <View
              key={c.label}
              style={{
                paddingHorizontal: 7,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: withOpacity(c.color, 0.12),
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: c.color }}>
                {c.label}
              </RNText>
            </View>
          ))}
        </View>
      );
    }
    case 'xp_gain': {
      const m = md as unknown as XPGainMeta;
      if (m.xp_delta == null) return null;
      const positive = m.xp_delta > 0;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 12,
              color: positive ? theme.colors.green : theme.colors.red,
            }}
          >
            {positive ? '+' : ''}
            {m.xp_delta} XP
          </RNText>
          <RNText
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12,
              color: theme.colors.slate,
              flex: 1,
            }}
          >
            {m.entry_name}
          </RNText>
        </View>
      );
    }
    case 'points_adjusted': {
      const m = md as unknown as PointsAdjustedMeta;
      if (m.adjustment == null) return null;
      const positive = m.adjustment > 0;
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 12,
              color: positive ? theme.colors.green : theme.colors.red,
            }}
          >
            {positive ? '+' : ''}
            {m.adjustment} pts
          </RNText>
          <RNText
            numberOfLines={1}
            style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate, flex: 1 }}
          >
            {m.reason}
          </RNText>
        </View>
      );
    }
    default:
      return null;
  }
}

function OutcomeChip({ outcome }: { outcome: string }) {
  const theme = useTheme();
  let label = 'Miss';
  let color: string = theme.colors.slate;
  switch (outcome) {
    case 'exact':
      label = 'Exact';
      color = theme.colors.accent;
      break;
    case 'winner_gd':
      label = 'Winner + GD';
      color = theme.colors.green;
      break;
    case 'winner':
      label = 'Winner';
      color = theme.colors.primary;
      break;
  }
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: withOpacity(color, 0.12),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color }}>{label}</RNText>
    </View>
  );
}

function PoolChip({ name }: { name: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: theme.colors.snow,
      }}
    >
      <Text
        style={{ fontFamily: fontFamilies.semibold, fontSize: 10, color: theme.colors.slate }}
      >
        {name}
      </Text>
    </View>
  );
}

// --- Icon / color resolution -----------------------------------------

function resolveIcon(item: ActivityItem): string {
  const md = item.metadata ?? {};
  switch (item.activityType) {
    case 'mention':
      return 'at.circle.fill';
    case 'rank_change': {
      const delta = (md as RankChangeMeta).delta;
      if (typeof delta === 'number') {
        return delta > 0 ? 'arrow.up.circle.fill' : 'arrow.down.circle.fill';
      }
      return 'arrow.up.arrow.down.circle.fill';
    }
    case 'deadline_alert':
      return 'clock.badge.exclamationmark.fill';
    case 'pool_joined':
      return item.icon || 'person.badge.plus';
    case 'pool_left':
      // Door-with-arrow reads as a clean "departed" signal regardless of
      // theme; same SF Symbol used in the Settings → Leave Pool row so
      // the visual maps across the two surfaces.
      return item.icon || 'rectangle.portrait.and.arrow.right';
    case 'pool_removed':
      // Strike-through user crop: the destination of the action ("you")
      // with an X over it. Distinguishes admin-initiated removal from
      // self-leave at a glance.
      return item.icon || 'person.crop.circle.badge.xmark';
    case 'level_up':
      return 'star.circle.fill';
    case 'streak_milestone': {
      const t = (md as StreakMilestoneMeta).streak_type;
      return t === 'cold' ? 'snowflake' : 'flame.fill';
    }
    case 'badge_earned': {
      const emoji = (md as BadgeEarnedMeta).badge_emoji;
      return emoji || 'trophy.circle.fill';
    }
    case 'prediction_result': {
      const outcome = (md as PredictionResultMeta).outcome;
      return outcome === 'miss' ? 'xmark.circle.fill' : 'checkmark.circle.fill';
    }
    case 'matchday_mvp':
      return 'crown.fill';
    case 'matchday_recap':
      return 'calendar.badge.checkmark';
    case 'prediction_submitted':
      return 'paperplane.circle.fill';
    case 'points_adjusted':
      return 'slider.horizontal.3';
    case 'xp_gain': {
      const source = (md as XPGainMeta).source;
      if (source === 'badge') return 'rosette';
      if (source === 'bonus') return 'sparkles';
      return 'chart.line.uptrend.xyaxis';
    }
    case 'welcome':
      return 'hand.wave.fill';
  }
}

/**
 * Heuristic match for the Swift `iconIsEmoji` check: SF Symbols always
 * contain a dot in the name (`person.badge.plus`); emoji never do, and
 * their first code unit is above 0xFF.
 */
function isEmojiIcon(icon: string): boolean {
  if (!icon || icon.includes('.')) return false;
  const cp = icon.codePointAt(0);
  return cp != null && cp > 0xff;
}

function resolveColorKey(item: ActivityItem): ActivityColorKey {
  const md = item.metadata ?? {};
  switch (item.activityType) {
    case 'mention':
      return 'primary';
    case 'rank_change': {
      const delta = (md as RankChangeMeta).delta;
      return typeof delta === 'number' && delta > 0 ? 'success' : 'error';
    }
    case 'deadline_alert':
      return 'warning';
    case 'pool_joined':
      return 'primary';
    case 'pool_left':
      // Soft amber: the user chose this; not an error state.
      return 'warning';
    case 'pool_removed':
      // Red: this happened TO the user without their consent.
      return 'error';
    case 'level_up':
      return 'accent';
    case 'streak_milestone': {
      const t = (md as StreakMilestoneMeta).streak_type;
      return t === 'cold' ? 'primary' : 'warning';
    }
    case 'badge_earned':
      return 'accent';
    case 'prediction_result': {
      const outcome = (md as PredictionResultMeta).outcome;
      if (outcome === 'exact') return 'accent';
      if (outcome === 'miss') return 'error';
      return 'success';
    }
    case 'matchday_mvp':
      return 'accent';
    case 'matchday_recap': {
      const m = md as MatchdayRecapMeta;
      return m.exact > 0 ? 'accent' : 'primary';
    }
    case 'prediction_submitted':
      return 'success';
    case 'points_adjusted': {
      const adj = (md as PointsAdjustedMeta).adjustment;
      return typeof adj === 'number' && adj > 0 ? 'success' : 'warning';
    }
    case 'xp_gain': {
      const source = (md as XPGainMeta).source;
      return source === 'match' ? 'success' : 'accent';
    }
    case 'welcome':
      return 'primary';
  }
}

type ThemeShape = ReturnType<typeof useTheme>;

function iconBg(theme: ThemeShape, key: ActivityColorKey): string {
  switch (key) {
    case 'primary':
      return theme.colors.primaryLight;
    case 'success':
      return theme.colors.greenLight;
    case 'warning':
      return theme.colors.amberLight;
    case 'error':
      return theme.colors.redLight;
    case 'accent':
      return theme.colors.accentLight;
  }
}

function iconFg(theme: ThemeShape, key: ActivityColorKey): string {
  switch (key) {
    case 'primary':
      return theme.colors.primary;
    case 'success':
      return theme.colors.green;
    case 'warning':
      return theme.colors.amber;
    case 'error':
      return theme.colors.red;
    case 'accent':
      return theme.colors.accent;
  }
}

function rarityColor(theme: ThemeShape, rarity: string): string {
  switch (rarity) {
    case 'Uncommon':
      return theme.colors.green;
    case 'Rare':
      return theme.colors.primary;
    case 'Very Rare':
      return '#6D28D9';
    case 'Legendary':
      return theme.colors.accent;
    case 'Common':
    default:
      return theme.colors.slate;
  }
}

function levelColor(theme: ThemeShape, level: number): string {
  if (level >= 10) return theme.colors.accent;
  if (level >= 8) return theme.colors.amber;
  if (level >= 6) return theme.colors.primary;
  if (level >= 4) return '#60A5FA';
  return theme.colors.green;
}

function readPoolName(item: ActivityItem): string | null {
  const v = (item.metadata as { pool_name?: unknown } | null)?.pool_name;
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function relativeTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const interval = (Date.now() - t) / 1000;
  // Future-dated timestamps (e.g. a tournament's last match used as a
  // proxy on a feed for a competition that hasn't finished) would
  // otherwise collapse into the < 60 branch and render as "just now".
  // Show an absolute date in that case so it never silently lies.
  if (interval < 0) {
    const d = new Date(t);
    const month = d.toLocaleString(undefined, { month: 'short' });
    return `${month} ${d.getDate()}`;
  }
  if (interval < 60) return 'just now';
  if (interval < 3600) return `${Math.floor(interval / 60)}m ago`;
  if (interval < 86400) return `${Math.floor(interval / 3600)}h ago`;
  if (interval < 604800) return `${Math.floor(interval / 86400)}d ago`;
  const d = new Date(t);
  const month = d.toLocaleString(undefined, { month: 'short' });
  return `${month} ${d.getDate()}`;
}
