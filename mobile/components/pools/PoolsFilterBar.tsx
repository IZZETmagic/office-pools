import { Pressable, ScrollView, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { type FilterSheetConfig } from './PoolsFilterSheet';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type StatusFilter = 'all' | 'open' | 'completed' | 'archived';
export type TypeFilter = 'all' | 'full_tournament' | 'progressive' | 'bracket_picker';
export type PredictionFilter = 'all' | 'submitted' | 'pending';
export type SortMode = 'smart' | 'newest' | 'name' | 'points';

export type PoolsFilters = {
  status: StatusFilter;
  type: TypeFilter;
  predictions: PredictionFilter;
  sort: SortMode;
};

export const DEFAULT_FILTERS: PoolsFilters = {
  status: 'all',
  type: 'all',
  predictions: 'all',
  sort: 'smart',
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'full_tournament', label: 'Full Tournament' },
  { value: 'progressive', label: 'Progressive' },
  { value: 'bracket_picker', label: 'Bracket' },
];

const PREDICTION_OPTIONS: Array<{ value: PredictionFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'submitted', label: 'Submitted' },
];

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'smart', label: 'Smart (Default)' },
  { value: 'newest', label: 'Newest' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'points', label: 'Most Points' },
];

type PoolsFilterBarProps = {
  filters: PoolsFilters;
  onChange: (next: PoolsFilters) => void;
  /**
   * Called when a chip or the sort button is tapped. Parent should open
   * its `PoolsFilterSheet` instance with the config. We pass a callback
   * instead of rendering the sheet here so the sheet can mount at the
   * screen root — a sheet rendered inside this bar's view tree positions
   * itself relative to the bar, not the bottom of the screen.
   */
  onOpenSheet: (config: FilterSheetConfig) => void;
};

export function PoolsFilterBar({ filters, onChange, onOpenSheet }: PoolsFilterBarProps) {
  const theme = useTheme();
  const hasActiveFilters =
    filters.status !== 'all' || filters.type !== 'all' || filters.predictions !== 'all';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.sm,
      }}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, alignItems: 'center' }}
        style={{ flex: 1 }}
      >
        <FilterChip
          label={
            filters.status === 'all'
              ? 'Status'
              : STATUS_OPTIONS.find((o) => o.value === filters.status)?.label ?? 'Status'
          }
          active={filters.status !== 'all'}
          onPress={() =>
            onOpenSheet({
              title: 'Status',
              options: STATUS_OPTIONS,
              selectedValue: filters.status,
              onPick: (v) => onChange({ ...filters, status: v as StatusFilter }),
            })
          }
        />
        <FilterChip
          label={
            filters.type === 'all'
              ? 'Type'
              : TYPE_OPTIONS.find((o) => o.value === filters.type)?.label ?? 'Type'
          }
          active={filters.type !== 'all'}
          onPress={() =>
            onOpenSheet({
              title: 'Pool Type',
              options: TYPE_OPTIONS,
              selectedValue: filters.type,
              onPick: (v) => onChange({ ...filters, type: v as TypeFilter }),
            })
          }
        />
        <FilterChip
          label={
            filters.predictions === 'all'
              ? 'Predictions'
              : PREDICTION_OPTIONS.find((o) => o.value === filters.predictions)?.label ??
                'Predictions'
          }
          active={filters.predictions !== 'all'}
          onPress={() =>
            onOpenSheet({
              title: 'Predictions',
              options: PREDICTION_OPTIONS,
              selectedValue: filters.predictions,
              onPick: (v) => onChange({ ...filters, predictions: v as PredictionFilter }),
            })
          }
        />
        {hasActiveFilters ? (
          <Pressable
            onPress={() =>
              onChange({ ...DEFAULT_FILTERS, sort: filters.sort })
            }
            hitSlop={4}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xs + 2,
              borderRadius: theme.radii.pill,
              backgroundColor: withOpacity(theme.colors.red, 0.1),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="xmark.circle.fill" color="red" size={12} />
            <Text
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 12,
                color: theme.colors.red,
              }}
            >
              Clear
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <Pressable
        onPress={() =>
          onOpenSheet({
            title: 'Sort by',
            options: SORT_OPTIONS,
            selectedValue: filters.sort,
            onPick: (v) => onChange({ ...filters, sort: v as SortMode }),
          })
        }
        hitSlop={8}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: theme.radii.pill,
          backgroundColor:
            filters.sort !== 'smart'
              ? withOpacity(theme.colors.primary, 0.12)
              : theme.colors.mist,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon
          name="arrow.up.arrow.down"
          color={filters.sort !== 'smart' ? 'primary' : 'slate'}
          size={14}
          weight="semibold"
        />
      </Pressable>

    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs + 2,
        borderRadius: theme.radii.pill,
        backgroundColor: active ? withOpacity(theme.colors.primary, 0.12) : theme.colors.mist,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          color: active ? theme.colors.primary : theme.colors.slate,
        }}
      >
        {label}
      </Text>
      <Icon name="chevron.down" color={active ? 'primary' : 'slate'} size={9} weight="semibold" />
    </Pressable>
  );
}
