import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

import { Crest } from './Crest';
import { useScoutPalette } from './tone';

// =============================================================
// One club a member leans on
// =============================================================
// ⚠ PHRASED AS A PROBLEM WITH THE CLUB, NOT WITH THE PERSON. Banter is public
// and this is the card that gets screenshotted into it. "Picks Man Utd to win 8
// times. Right twice." is a fact about football; "bad at picking" is a fact
// about somebody, and this product's stated purpose is no bad feelings.
//
// ## ⚠⚠ THE COUNT IS PASSED IN, NOT READ OFF THE LEAN
//
// It was `backed of seen` for every row, which is right for "backs most" and the
// exact OPPOSITE claim on "picks against" — that row reported how often they
// BACK a club under a heading saying they oppose it, with a detail line beneath
// it giving the real number. One row contradicting itself, and nothing errored.
//
// ⚠ THE FRACTION, NOT "3×". The duel card's row shows a bare count because it
// has no room for more; this card's whole argument is that nine of nine is a
// habit and three of nine is not, and a count with no denominator cannot tell
// those apart.
// =============================================================

export function Lean({
  label,
  club,
  count,
  detail,
  /**
   * ⚠ `loss` IS THE ONLY TONE THIS TAKES BESIDES NEUTRAL, and it is for the
   * blind spot — a club they back and are usually wrong about. That is genuinely
   * bad news for them, which is the one thing red is allowed to mean here.
   */
  tone = 'neutral',
}: {
  label: string;
  club: { name: string; crestUrl: string | null };
  count: { value: number; of: number };
  detail: string;
  tone?: 'neutral' | 'loss';
}) {
  const theme = useTheme();
  const palette = useScoutPalette();

  return (
    <View
      style={{
        backgroundColor: tone === 'loss' ? palette.loss.tint : theme.colors.mist,
        borderRadius: theme.radii.sm,
        padding: 12,
        gap: 8,
      }}
    >
      <Text variant="detail" color="slate" style={{ letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Crest url={club.crestUrl} size={24} />
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: fontFamilies.bold,
            fontSize: 15,
            color: theme.colors.ink,
          }}
        >
          {club.name}
        </RNText>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: tone === 'loss' ? palette.loss.fg : theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {count.value} of {count.of}
        </RNText>
      </View>

      <Text variant="detail" color="slate">
        {detail}
      </Text>
    </View>
  );
}
