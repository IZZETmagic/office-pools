import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { Icon } from '@/components/ui';
import type { LevelInfo, XPData } from '@/lib/api';
import { useEntryAnalytics } from '@/lib/useEntryAnalytics';
import { useEntryBracketAnalytics } from '@/lib/useEntryBracketAnalytics';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// A normalized shape both score-prediction (XPData) and bracket-picker
// (BPXPData) collapse into so the runway / summary can render uniformly.
type NormalizedXP = {
  total_xp: number;
  current_level: LevelInfo;
  next_level: LevelInfo | null;
  xp_to_next_level: number;
  level_progress: number;
  levels: LevelInfo[];
  summary_pills: Array<{ label: string; value: number; color: string }>;
};

export default function LevelsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, entryId, mode } = useLocalSearchParams<{
    id: string;
    entryId: string;
    mode?: string;
  }>();
  const isBP = mode === 'bracket_picker';

  if (isBP) {
    return <BPLevelsContent poolId={id} entryId={entryId} insets={insets} theme={theme} />;
  }
  return <ScoreLevelsContent poolId={id} entryId={entryId} insets={insets} theme={theme} />;
}

function ScoreLevelsContent({
  poolId,
  entryId,
  insets,
  theme,
}: {
  poolId: string;
  entryId: string;
  insets: { top: number; bottom: number };
  theme: ReturnType<typeof useTheme>;
}) {
  const { data, loading } = useEntryAnalytics(poolId, entryId);
  const normalized = data
    ? normalizeScoreXP(data.xp, theme)
    : null;
  return <LevelsView normalized={normalized} loading={loading} insets={insets} theme={theme} />;
}

function BPLevelsContent({
  poolId,
  entryId,
  insets,
  theme,
}: {
  poolId: string;
  entryId: string;
  insets: { top: number; bottom: number };
  theme: ReturnType<typeof useTheme>;
}) {
  const { data, loading } = useEntryBracketAnalytics(poolId, entryId);
  const normalized = data
    ? normalizeBPXP(data.xp, theme)
    : null;
  return <LevelsView normalized={normalized} loading={loading} insets={insets} theme={theme} />;
}

function normalizeScoreXP(
  xp: XPData,
  theme: ReturnType<typeof useTheme>,
): NormalizedXP {
  return {
    total_xp: xp.total_xp,
    current_level: xp.current_level,
    next_level: xp.next_level,
    xp_to_next_level: xp.xp_to_next_level,
    level_progress: xp.level_progress,
    levels: xp.levels,
    summary_pills: [
      { label: 'Match XP', value: xp.total_base_xp, color: theme.colors.primary },
      { label: 'Bonus XP', value: xp.total_bonus_xp, color: theme.colors.amber },
      { label: 'Badge XP', value: xp.total_badge_xp, color: theme.colors.accent },
    ],
  };
}

function normalizeBPXP(
  xp: {
    total_xp: number;
    total_group_base_xp: number;
    total_group_bonus_xp: number;
    total_knockout_base_xp: number;
    total_knockout_bonus_xp: number;
    total_badge_xp: number;
    current_level: LevelInfo;
    next_level: LevelInfo | null;
    xp_to_next_level: number;
    level_progress: number;
    levels: LevelInfo[];
  },
  theme: ReturnType<typeof useTheme>,
): NormalizedXP {
  const groupTotal = xp.total_group_base_xp + xp.total_group_bonus_xp;
  const knockoutTotal = xp.total_knockout_base_xp + xp.total_knockout_bonus_xp;
  return {
    total_xp: xp.total_xp,
    current_level: xp.current_level,
    next_level: xp.next_level,
    xp_to_next_level: xp.xp_to_next_level,
    level_progress: xp.level_progress,
    levels: xp.levels,
    summary_pills: [
      { label: 'Group XP', value: groupTotal, color: theme.colors.primary },
      { label: 'Knockout XP', value: knockoutTotal, color: theme.colors.green },
      { label: 'Badge XP', value: xp.total_badge_xp, color: theme.colors.accent },
    ],
  };
}

function LevelsView({
  normalized,
  loading,
  insets,
  theme,
}: {
  normalized: NormalizedXP | null;
  loading: boolean;
  insets: { top: number; bottom: number };
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      {loading || !normalized ? (
        <>
          <Header insetTop={insets.top} xp={null} />
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        </>
      ) : (
        <>
          <Header insetTop={insets.top} xp={normalized} />
          <RunwayList xp={normalized} bottomInset={insets.bottom} />
        </>
      )}
    </View>
  );
}

function Header({ insetTop, xp }: { insetTop: number; xp: NormalizedXP | null }) {
  const theme = useTheme();
  const lvlColor = xp ? levelColor(theme, xp.current_level.level) : theme.colors.slate;
  const progressText = xp
    ? xp.next_level !== null
      ? `${xp.xp_to_next_level.toLocaleString()} XP to ${xp.next_level.name}`
      : 'Maximum level reached'
    : '';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: insetTop + theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
        backgroundColor: theme.colors.surface,
        borderBottomWidth: theme.borders.thin,
        borderBottomColor: withOpacity(theme.colors.silver, 0.5),
      }}
    >
      {xp ? (
        <CircleProgress
          size={56}
          stroke={6}
          progress={Math.max(0, Math.min(1, xp.level_progress))}
          color={lvlColor}
          label={`${xp.current_level.level}`}
        />
      ) : (
        <View style={{ width: 56, height: 56 }} />
      )}
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 17,
            color: theme.colors.ink,
          }}
          numberOfLines={1}
        >
          {xp ? xp.current_level.name : 'Level Runway'}
        </RNText>
        {xp ? (
          <>
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 13,
                color: theme.colors.slate,
                fontVariant: ['tabular-nums'],
              }}
            >
              {xp.total_xp.toLocaleString()} XP
            </RNText>
            <RNText
              style={{
                fontFamily: fontFamilies.regular,
                fontSize: 12,
                color: theme.colors.slate,
              }}
              numberOfLines={1}
            >
              {progressText}
            </RNText>
          </>
        ) : null}
      </View>
      <Pressable
        onPress={() => router.back()}
        hitSlop={theme.spacing.md}
        accessibilityLabel="Close"
        accessibilityRole="button"
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.ink, 0.06),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="xmark" size={14} tint={theme.colors.ink} weight="semibold" />
      </Pressable>
    </View>
  );
}

function RunwayList({ xp, bottomInset }: { xp: NormalizedXP; bottomInset: number }) {
  const theme = useTheme();
  const lvlColor = levelColor(theme, xp.current_level.level);
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        paddingBottom: bottomInset + theme.spacing.xl,
        gap: theme.spacing.sm,
      }}
    >
      {xp.levels.map((lvl) => (
        <LevelRow
          key={lvl.level}
          level={lvl}
          totalXp={xp.total_xp}
          currentLevel={xp.current_level.level}
        />
      ))}
      <Summary xp={xp} lvlColor={lvlColor} />
    </ScrollView>
  );
}

function LevelRow({
  level,
  totalXp,
  currentLevel,
}: {
  level: LevelInfo;
  totalXp: number;
  currentLevel: number;
}) {
  const theme = useTheme();
  const isReached = totalXp >= level.xp_required;
  const isCurrent = level.level === currentLevel;
  const lvlColor = levelColor(theme, level.level);

  const circleFill = isReached ? theme.colors.green : theme.colors.silver;
  const nameColor = isCurrent
    ? lvlColor
    : isReached
      ? theme.colors.ink
      : theme.colors.slate;
  const xpColor = isCurrent
    ? lvlColor
    : isReached
      ? theme.colors.green
      : theme.colors.silver;
  const bgColor = isCurrent
    ? withOpacity(lvlColor, 0.08)
    : isReached
      ? theme.colors.greenLight
      : theme.colors.mist;
  const borderColor = isCurrent ? withOpacity(lvlColor, 0.3) : 'transparent';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: bgColor,
        borderWidth: theme.borders.standard,
        borderColor,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: theme.radii.pill,
          backgroundColor: circleFill,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {isReached ? (
          <Icon name="checkmark" size={14} tint="#fff" weight="bold" />
        ) : (
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 13,
              fontWeight: '800',
              color: theme.colors.slate,
            }}
          >
            {level.level}
          </RNText>
        )}
      </View>

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: nameColor,
          }}
          numberOfLines={1}
        >
          {level.name}
        </RNText>
        {level.badge ? (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
            }}
            numberOfLines={1}
          >
            Unlocks: {level.badge}
          </RNText>
        ) : null}
      </View>

      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 12,
          fontWeight: '600',
          color: xpColor,
          fontVariant: ['tabular-nums'],
        }}
      >
        {level.xp_required.toLocaleString()} XP
      </RNText>
    </View>
  );
}

function Summary({ xp, lvlColor }: { xp: NormalizedXP; lvlColor: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 28,
          fontWeight: '900',
          color: lvlColor,
          fontVariant: ['tabular-nums'],
        }}
      >
        {xp.total_xp.toLocaleString()} XP
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 13,
          color: theme.colors.slate,
        }}
      >
        {xp.next_level
          ? `${xp.xp_to_next_level.toLocaleString()} XP to ${xp.next_level.name}`
          : 'Maximum level reached'}
      </RNText>
      <View style={{ flexDirection: 'row', gap: theme.spacing.xs, paddingTop: theme.spacing.xs }}>
        {xp.summary_pills.map((p) => (
          <SummaryPill key={p.label} label={p.label} value={p.value} color={p.color} />
        ))}
      </View>
    </View>
  );
}

function SummaryPill({ label, value, color }: { label: string; value: number; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(color, 0.1),
        borderWidth: theme.borders.standard,
        borderColor: withOpacity(color, 0.2),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 11, color }}>
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 11,
          fontWeight: '800',
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value.toLocaleString()}
      </RNText>
    </View>
  );
}

function CircleProgress({
  size,
  stroke,
  progress,
  color,
  label,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  label: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={withOpacity(color, 0.2)}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <RNText
        style={{
          position: 'absolute',
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 18,
          fontWeight: '900',
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function levelColor(theme: ReturnType<typeof useTheme>, level: number): string {
  if (level >= 10) return theme.colors.accent;
  if (level >= 8) return theme.colors.amber;
  if (level >= 6) return theme.colors.primary;
  if (level >= 4) return '#57D0FF';
  return theme.colors.green;
}
