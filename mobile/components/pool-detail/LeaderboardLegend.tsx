import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

const ITEMS: Array<{ color: string; label: string }> = [
  { color: '#E2B830', label: 'Exact' },
  { color: '#52D660', label: 'W+GD' },
  { color: '#30B7FF', label: 'Winner' },
  { color: '#EF4444', label: 'Miss' },
];

/**
 * The same legend, narrowed to what a league pool's scoring can actually emit.
 *
 * ⚠ AT RESULTS DEPTH ONLY `winner` AND `miss` EXIST. A member taps W/D/L and
 * there is no scoreline, so the engine writes exactly two of these four types
 * (066:184). Showing the full key there promises two tiers that can never
 * appear — the reader concludes they have simply never scored an Exact, when in
 * fact the game never offered one.
 *
 * ⚠ `depth === 'results'` is the ONLY safe test. A NULL depth is scored as
 * Scores, byte for byte; the opposite polarity has shipped three times on web
 * and was called a deploy blocker because it fails silently. Guarded by
 * `lib/__tests__/leagueDepthPolarity.guard.test.ts`, which walks `mobile/`.
 */
export function LeagueFormLegend({ depth }: { depth: 'results' | 'scores' | null }) {
  const items = depth === 'results' ? ITEMS.filter((i) => i.label === 'Winner' || i.label === 'Miss') : ITEMS;
  return <Legend items={items} />;
}

export function LeaderboardLegend() {
  return <Legend items={ITEMS} />;
}

function Legend({ items }: { items: typeof ITEMS }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        justifyContent: 'center',
        paddingVertical: theme.spacing.xs,
      }}
    >
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: item.color,
            }}
          />
          <Text
            variant="caption"
            color="slate"
            style={{ textTransform: 'none', letterSpacing: 0 }}
          >
            {item.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
