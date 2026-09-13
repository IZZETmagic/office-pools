import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// Read it lightly
// =============================================================
// ⚠ AMBER IS A CAVEAT AND NEVER ALSO A STATISTIC. This is the feature admitting
// its own limits; a figure wearing amber reads as a warning about the figure.
// The contrarian index used to be amber, which made "34% against the crowd" look
// like a problem with the member.
//
// ## ⚠⚠ THE CAVEAT SITS ABOVE THE NUMBERS, NOT UNDER THEM
//
// A reader who stops after the first figure should already know the sample is
// thin. A note underneath is read by the people who least need it.
//
// ⚠ AND IT DOES NOT HIDE ANYTHING. Ryan, 2026-09-11: say the sample is thin and
// show the numbers anyway. Every figure already carries its own denominator and
// `rate()` still refuses to turn three of four into a percentage — "2 of 3" over
// a stated caveat is information, and withholding it was paternalism.
// =============================================================

export function Caveat({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const palette = useScoutPalette();

  return (
    <View
      style={{
        backgroundColor: palette.caveat.tint,
        borderRadius: theme.radii.sm,
        paddingHorizontal: 12,
        paddingVertical: 9,
      }}
    >
      <Text variant="detail" style={{ color: palette.caveat.fg, lineHeight: 15 }}>
        {children}
      </Text>
    </View>
  );
}
