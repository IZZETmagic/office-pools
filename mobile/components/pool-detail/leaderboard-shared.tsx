import { Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { LeaderboardEntry, PoolAward } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const FORM_COLOR: Record<LeaderboardEntry['last_five'][number], string> = {
  exact: '#E2B830',
  winner_gd: '#52D660',
  winner: '#30B7FF',
  miss: '#EF4444',
  no_pick: '#D4DAE8',
};

export function FormDots({
  results,
  streak,
  size = 8,
}: {
  results: LeaderboardEntry['last_five'];
  streak?: LeaderboardEntry['current_streak'];
  size?: number;
}) {
  const theme = useTheme();
  const showStreak = streak && streak.type !== 'none' && streak.length >= 3;
  const streakColor = streak?.type === 'hot' ? theme.colors.amber : theme.colors.primary;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      {results.map((r, i) => (
        <View
          key={i}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: FORM_COLOR[r] }}
        />
      ))}
      {showStreak ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1, marginLeft: 2 }}>
          <Icon
            name={(streak.type === 'hot' ? 'flame.fill' : 'snowflake') as never}
            color={streak.type === 'hot' ? 'amber' : 'primary'}
            size={9}
          />
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 9,
              color: streakColor,
            }}
          >
            {streak.length}
          </RNText>
        </View>
      ) : null}
    </View>
  );
}

export function LevelPill({ level, levelName }: { level: number; levelName: string }) {
  const theme = useTheme();
  let bg = theme.colors.mist;
  let fg = theme.colors.slate;
  if (level === 10) {
    bg = theme.colors.accent;
    fg = '#FFFFFF';
  } else if (level >= 8) {
    bg = withOpacity(theme.colors.amber, 0.15);
    fg = theme.colors.amber;
  } else if (level >= 6) {
    bg = withOpacity(theme.colors.primary, 0.12);
    fg = theme.colors.primary;
  } else if (level >= 4) {
    bg = withOpacity(theme.colors.primary, 0.08);
    fg = theme.colors.primary;
  }
  return (
    <View
      style={{
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: bg,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 9,
          color: fg,
        }}
      >
        Lv.{level} {levelName}
      </RNText>
    </View>
  );
}

const AWARD_ICON: Record<string, string> = {
  mvp: 'trophy.fill',
  contrarian: 'dice.fill',
  crowd: 'person.3.fill',
  hot: 'flame.fill',
  cold: 'snowflake',
  sharpshooter: 'scope',
};

export function AwardBadge({ award }: { award: PoolAward }) {
  const theme = useTheme();
  const icon = AWARD_ICON[award.type] ?? 'star.fill';
  const palette = awardPalette(award.type, theme);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: palette.bg,
      }}
    >
      <Icon name={icon as never} color={palette.iconToken} size={9} />
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 9,
          color: palette.fg,
        }}
      >
        {award.label}
      </RNText>
    </View>
  );
}

function awardPalette(type: string, theme: ReturnType<typeof useTheme>) {
  switch (type) {
    case 'mvp':
      return {
        bg: withOpacity(theme.colors.accent, 0.15),
        fg: theme.colors.accent,
        iconToken: 'accent' as const,
      };
    case 'hot':
      return {
        bg: withOpacity(theme.colors.red, 0.12),
        fg: theme.colors.red,
        iconToken: 'red' as const,
      };
    case 'contrarian':
    case 'crowd':
    case 'cold':
      return {
        bg: withOpacity(theme.colors.primary, type === 'cold' ? 0.08 : 0.12),
        fg: theme.colors.primary,
        iconToken: 'primary' as const,
      };
    default:
      return {
        bg: theme.colors.mist,
        fg: theme.colors.slate,
        iconToken: 'slate' as const,
      };
  }
}

export function rankColor(rank: number, theme: ReturnType<typeof useTheme>): string {
  if (rank === 1) return theme.colors.accent;
  if (rank === 2) return theme.colors.slate;
  if (rank === 3) return theme.colors.bronze;
  return theme.colors.ink;
}
