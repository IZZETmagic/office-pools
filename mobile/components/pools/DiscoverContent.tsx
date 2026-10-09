import { router } from 'expo-router';
import { Platform, TextInput, View } from 'react-native';

import { DiscoverPoolCard } from './DiscoverPoolCard';
import { Icon, Text, Pressable } from '@/components/ui';
import type { DiscoverPool } from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type DiscoverFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
};

/**
 * Discover's search box.
 *
 * Its type pills moved into the filter sheet (`DiscoverFilterSheet`) with the
 * header's filter button. ⚠ THEY HAD ONLY EVER KNOWN THE THREE WORLD CUP
 * MODES and matched them against `predictionMode`, so no pill could show a
 * league pool — and on 2026-10-09 both public pools were Premier League
 * Pick'em, so three of the four pills led to "No pools match".
 */
export function DiscoverFilters({ search, onSearchChange }: DiscoverFiltersProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.snow,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: Platform.OS === 'ios' ? theme.spacing.md : theme.spacing.xs,
          ...theme.shadows.card,
        }}
      >
        <Icon name="magnifyingglass" color="slate" size={16} />
        <TextInput
          value={search}
          onChangeText={onSearchChange}
          placeholder="Search pools"
          placeholderTextColor={withOpacity(theme.colors.slate, 0.7)}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            flex: 1,
            fontFamily: fontFamilies.medium,
            fontSize: 16,
            color: theme.colors.ink,
          }}
        />
        {search ? (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <Icon name="xmark.circle.fill" color="slate" size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

type DiscoverListProps = {
  /** Already searched, filtered and sorted — `applyDiscoverFilters`, on the screen. */
  pools: DiscoverPool[];
  loading: boolean;
  error: string | null;
  /** A search or a filter is narrowing the list, so empty means "no match", not "none exist". */
  narrowed: boolean;
};

export function DiscoverList({ pools: filtered, loading, error, narrowed }: DiscoverListProps) {
  const theme = useTheme();

  function handleCardPress(poolId: string) {
    router.navigate(`/pool-preview/${poolId}`);
  }

  if (loading) {
    return (
      <DiscoverState
        icon="magnifyingglass"
        title="Loading pools…"
        subtitle="Hang tight."
      />
    );
  }

  if (error) {
    return <DiscoverState icon="wifi.exclamationmark" title="Couldn't load pools" subtitle={error} />;
  }

  if (filtered.length === 0) {
    if (narrowed) {
      return (
        <DiscoverState
          icon="line.3.horizontal.decrease.circle"
          title="No pools match"
          subtitle="Try a different search or filter."
        />
      );
    }
    return (
      <DiscoverState
        icon="trophy"
        title="No public pools yet"
        subtitle="Check back as more pools open up."
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {filtered.map((pool) => (
        <DiscoverPoolCard
          key={pool.poolId}
          pool={pool}
          onPress={() => handleCardPress(pool.poolId)}
        />
      ))}
    </View>
  );
}

function DiscoverState({
  icon,
  title,
  subtitle,
}: {
  icon: string;
  title: string;
  subtitle: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: theme.radii.xl,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={icon as never} color="primary" size={28} />
      </View>
      <View style={{ alignItems: 'center', gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xl }}>
        <Text variant="cardTitle" align="center">
          {title}
        </Text>
        <Text variant="body" color="slate" align="center">
          {subtitle}
        </Text>
      </View>
    </View>
  );
}
