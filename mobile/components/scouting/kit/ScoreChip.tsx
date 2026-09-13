import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { outcomeTone } from '@/lib/scoutTone';
import { useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// One past meeting, as it was played
// =============================================================
// ⚠⚠ THE SCORELINE IS LEFT AS PLAYED — home side first — and is NOT flipped into
// this fixture's order. A member reading "2–1" against a date and a ground is
// reading the scoreboard from that day; rewriting it to put today's home club
// first would silently invert half of them. The caption at the foot of the card
// says which way round it is, and that caption is load-bearing.
//
// ⚠ SO THE TONE FOLLOWS THE SCORELINE AS PRINTED, not the fixture's home club.
// Whose win it was depends on who was home THAT DAY. Colouring by today's home
// club would produce a chip whose colour contradicts the numbers inside it.
// =============================================================

export function ScoreChip({
  homeGoals,
  awayGoals,
  /** Short date — "May 26". The year matters; a month alone reads as this season. */
  when,
}: {
  homeGoals: number;
  awayGoals: number;
  when: string;
}) {
  const theme = useTheme();
  const palette = useScoutPalette();
  const tone = palette[outcomeTone(homeGoals, awayGoals)];

  return (
    <View
      style={{
        backgroundColor: tone.tint,
        borderRadius: theme.radii.xs,
        paddingHorizontal: 11,
        paddingVertical: 8,
        alignItems: 'center',
        minWidth: 62,
      }}
    >
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 13,
          color: tone.fg,
          fontVariant: ['tabular-nums'],
        }}
      >
        {/* ⚠ AN EN DASH, NOT A HYPHEN. The payload carries "2-1"; a scoreline is
            written 2–1 and the difference is visible at 13pt. */}
        {homeGoals}–{awayGoals}
      </RNText>
      <Text variant="detail" color="slate">
        {when}
      </Text>
    </View>
  );
}
