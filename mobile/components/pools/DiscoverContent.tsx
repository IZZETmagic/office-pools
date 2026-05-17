import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';

import { DiscoverPoolCard } from './DiscoverPoolCard';
import { Icon, Text } from '@/components/ui';
import { useDiscoverPools } from '@/lib/useDiscoverPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type DiscoverModeFilter = 'all' | 'full_tournament' | 'progressive' | 'bracket_picker';

const MODE_PILLS: Array<{ value: DiscoverModeFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'full_tournament', label: 'Full Tournament' },
  { value: 'progressive', label: 'Progressive' },
  { value: 'bracket_picker', label: 'Bracket' },
];

type DiscoverFiltersProps = {
  search: string;
  onSearchChange: (value: string) => void;
  mode: DiscoverModeFilter;
  onModeChange: (mode: DiscoverModeFilter) => void;
};

export function DiscoverFilters({
  search,
  onSearchChange,
  mode,
  onModeChange,
}: DiscoverFiltersProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.md,
        gap: theme.spacing.md,
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm, paddingVertical: 2, alignItems: 'center' }}
        style={{ flexGrow: 0 }}
      >
        {MODE_PILLS.map((p) => {
          const active = mode === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => onModeChange(p.value)}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs + 2,
                borderRadius: theme.radii.pill,
                backgroundColor: active ? theme.colors.primary : theme.colors.mist,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                  color: active ? '#FFFFFF' : theme.colors.slate,
                  letterSpacing: 0.3,
                }}
              >
                {p.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

type DiscoverListProps = {
  search: string;
  mode: DiscoverModeFilter;
};

export function DiscoverList({ search, mode }: DiscoverListProps) {
  const theme = useTheme();
  const { pools, loading, error } = useDiscoverPools();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return pools.filter((p) => {
      if (mode !== 'all' && p.predictionMode !== mode) return false;
      if (q && !p.poolName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pools, search, mode]);

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
    if (search || mode !== 'all') {
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
