// The chips over the Activity history. Sticky under the header, so the filter
// stays in reach while scrolling a long week.

import { Pressable, ScrollView, Text as RNText } from 'react-native';

import { FILTERS, type ActivityFilter } from '@/lib/activityFilters';
import { fontFamilies, useTheme } from '@/theme';

export function ActivityFilterChips({
  value,
  onChange,
  unreadMentions,
}: {
  value: ActivityFilter;
  onChange: (next: ActivityFilter) => void;
  /** Shown on the Mentions chip when > 0. */
  unreadMentions: number;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ backgroundColor: theme.colors.snow }}
      contentContainerStyle={{
        gap: theme.spacing.sm - 2,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.sm,
      }}
    >
      {FILTERS.map((f) => {
        const active = f.key === value;
        const label =
          f.key === 'mentions' && unreadMentions > 0 ? `${f.label} · ${unreadMentions}` : f.label;
        return (
          <Pressable
            key={f.key}
            onPress={() => onChange(f.key)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => ({
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.xs + 3,
              borderRadius: theme.radii.pill,
              backgroundColor: active ? theme.colors.ink : theme.colors.surface,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 12,
                color: active ? theme.colors.snow : theme.colors.slate,
              }}
            >
              {label}
            </RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
