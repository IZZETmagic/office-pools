import { Text as RNText, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// The line worth reading aloud
// =============================================================
// "Chelsea have not won at the Emirates since 2011." This is the thing people
// screenshot, and it is the only element on a card allowed to be gold.
//
// ## ⚠⚠ AT MOST ONE PER CARD, AND A CARD MAY HAVE NONE
//
// Gold spent a release meaning five things at once — the drought, signature
// figures, the away club in the crowd bar, the reality mark on a comparison, and
// the exact-score count. A colour that means five things means none of them. If
// a card has nothing worth reading aloud it carries no gold, and that is the
// normal case rather than a failure.
//
// ⚠ IT STATES WHAT IT IS COUNTED OVER. "Not won in 7 visits" and "not won in 2"
// are different claims, and the caption is the difference between a finding and
// an anecdote.
//
// ⚠ IT REPORTS, IT NEVER ADVISES. The same fact can be written as a bookmaker's
// card and this product is explicitly not for bettors. "Chelsea have not won
// here since 2011" is history; "back Arsenal" is a tip, and the line between
// them has to be held in the copy, not just in the design.
// =============================================================

export function Finding({
  children,
  /** The sample — "7 visits", "3 of 11". Never omitted where one exists. */
  note,
}: {
  children: React.ReactNode;
  note?: string;
}) {
  const theme = useTheme();
  const palette = useScoutPalette();

  return (
    <View
      style={{
        backgroundColor: palette.finding.tint,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: palette.finding.fg,
        borderRadius: theme.radii.sm,
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 6,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          lineHeight: 20,
          color: theme.colors.ink,
        }}
      >
        {children}
      </RNText>
      {note ? (
        <Text variant="detail" style={{ color: palette.finding.fg }}>
          {note.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
}
