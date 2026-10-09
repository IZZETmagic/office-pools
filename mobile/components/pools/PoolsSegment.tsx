import { View } from 'react-native';

import {
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  THUMB_HEIGHT,
  THUMB_RADIUS,
  TRACK_INSET,
} from './controlShape';
import { Icon, Pressable, Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type PoolsTab = 'my-pools' | 'discover';

export type PoolsFilterButtonState = {
  /** Filters narrowing the list — the number on the badge. */
  activeCount: number;
  /** The sort is not the default. Shown as a dot when no filter is on. */
  sortChanged: boolean;
  onPress: () => void;
};

type PoolsSegmentProps = {
  active: PoolsTab;
  onChange: (tab: PoolsTab) => void;
  /**
   * The sort-and-filter button on the right. Null where there is nothing to
   * filter — Discover, which keeps its own search and pills, and a member with
   * no pools yet.
   */
  filter: PoolsFilterButtonState | null;
};

/**
 * `[ My Pools | Discover ]` on the left, the filter button on the right.
 *
 * ⚠ THE BUTTON IS NO TALLER THAN THE TRACK beside it, so the row is the same
 * height with or without it and switching to Discover does not nudge
 * everything below.
 */
export function PoolsSegment({ active, onChange, filter }: PoolsSegmentProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          height: CONTROL_HEIGHT,
          padding: TRACK_INSET,
          borderRadius: CONTROL_RADIUS,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.mist,
        }}
      >
        <SegmentLabel active={active === 'my-pools'} onPress={() => onChange('my-pools')} label="My Pools" />
        <SegmentLabel active={active === 'discover'} onPress={() => onChange('discover')} label="Discover" />
      </View>
      {filter ? <FilterButton {...filter} /> : null}
    </View>
  );
}

function SegmentLabel({
  active,
  onPress,
  label,
}: {
  active: boolean;
  onPress: () => void;
  label: string;
}) {
  const theme = useTheme();
  // In dark mode `surface` is DARKER than `mist`, so a surface thumb would sit
  // in the track like a hole. `silver` is the step lighter.
  const thumb = theme.mode === 'dark' ? theme.colors.silver : theme.colors.surface;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        height: THUMB_HEIGHT,
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.lg,
        borderRadius: THUMB_RADIUS,
        borderCurve: 'continuous',
        backgroundColor: active ? thumb : 'transparent',
        opacity: pressed ? 0.7 : 1,
        ...(active ? theme.shadows.card : null),
      })}
    >
      <Text
        style={{
          fontFamily: active ? fontFamilies.black : fontFamilies.bold,
          fontSize: 14,
          color: active ? theme.colors.primary : theme.colors.slate,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FilterButton({ activeCount, sortChanged, onPress }: PoolsFilterButtonState) {
  const theme = useTheme();
  const engaged = activeCount > 0 || sortChanged;
  const label =
    activeCount > 0
      ? `Sort and filter pools, ${activeCount} ${activeCount === 1 ? 'filter' : 'filters'} on`
      : sortChanged
        ? 'Sort and filter pools, sort changed'
        : 'Sort and filter pools';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: CONTROL_HEIGHT,
        height: CONTROL_HEIGHT,
        borderRadius: CONTROL_RADIUS,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: engaged ? withOpacity(theme.colors.primary, 0.14) : theme.colors.mist,
        // The badge hangs off the corner; Android would clip it otherwise.
        overflow: 'visible',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon
        name="line.3.horizontal.decrease"
        color={engaged ? 'primary' : 'ink'}
        size={20}
        weight="semibold"
      />
      {activeCount > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            width: 20,
            height: 20,
            borderRadius: 10,
            borderWidth: 2,
            borderColor: theme.colors.snow,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: fontFamilies.black, fontSize: 10, lineHeight: 12, color: '#FFFFFF' }}>
            {activeCount}
          </Text>
        </View>
      ) : sortChanged ? (
        <View
          style={{
            position: 'absolute',
            top: 1,
            right: 1,
            width: 10,
            height: 10,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: theme.colors.snow,
            backgroundColor: theme.colors.primary,
          }}
        />
      ) : null}
    </Pressable>
  );
}
