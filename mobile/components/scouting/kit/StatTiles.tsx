import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { ScoutTone } from '@/lib/scoutTone';
import { useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// Two or three big numbers
// =============================================================
// ## ⚠⚠ THEY USED TO WEAR THE SCORING-TIER COLOURS, AND NEITHER TILE IS A TIER
//
// The accuracy card painted its hit rate in `tierWinner` (cyan) and its exact
// count in `tierExact` (gold) — the colours the league scoring engine uses for
// the four score buckets. A hit RATE is an aggregate over all four buckets, not
// the winner bucket, so the colour was asserting a relationship that does not
// exist. Tier colours belong wherever a tier is literally being shown.
//
// ⚠ A FIGURE HAS TO EARN A COLOUR. Tiles are `neutral` by default and at most
// one per row is the `finding`. A row where every tile is coloured has no
// hierarchy, which is the state the accuracy card was in.
// =============================================================

export type StatTile = {
  /** Pre-formatted — "48%", "3.4", "—". The tile does no arithmetic. */
  value: string;
  label: string;
  /**
   * ⚠ DEFAULTS TO `neutral`. Pass `finding` for the one figure that is the point
   * of the card, and `loss` only where the number is genuinely bad news (a
   * missed pick has already changed a result).
   */
  tone?: ScoutTone;
};

export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  const theme = useTheme();
  const palette = useScoutPalette();

  return (
    <View style={{ flexDirection: 'row', gap: 9 }}>
      {tiles.map((t) => (
        <View
          key={t.label}
          style={{
            flex: 1,
            backgroundColor: theme.colors.mist,
            borderRadius: theme.radii.sm,
            paddingVertical: 12,
            paddingHorizontal: 10,
            gap: 4,
            minWidth: 0,
          }}
        >
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 18,
              color: palette[t.tone ?? 'neutral'].fg,
              fontVariant: ['tabular-nums'],
            }}
          >
            {t.value}
          </RNText>
          <Text variant="detail" color="slate">
            {t.label}
          </Text>
        </View>
      ))}
    </View>
  );
}
