import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { ScoutFormLetter } from '@/lib/scoutTone';
import { fontFamilies, useTheme } from '@/theme';

import { Crest } from './Crest';
import { FormStrip } from './FormStrip';

// =============================================================
// The two sides, at the ends they are playing
// =============================================================
// ## ⚠⚠ THE VENUE SPLIT IS THE CARD, AND THE OVERALL IS THE FALLBACK
//
// "Arsenal at home" and "Chelsea away" are the two facts the fixture is actually
// made of, and a league table — which sums them — reports the average of two
// different teams. A fortress-at-home / dreadful-away side is the most useful
// single thing a pick'em player can know and it is invisible on a table.
//
// But in August the split is one game deep, and one game is a fact rather than a
// pattern, so the overall strip sits underneath it and says how many it is over.
// Neither number is hidden and neither is oversold.
// =============================================================

export type VenueSide = {
  club: { name: string; crestUrl: string | null };
  venue: 'home' | 'away';
  played: number;
  strip: ScoutFormLetter[];
  /**
   * ⚠⚠ NULL WHEN NOTHING HAS BEEN PLAYED AT THAT VENUE, AND NEVER 0.
   *
   * The server is explicit about this and the distinction is the whole reason
   * the field is nullable: "0.0 scored a game" is a statement about a club that
   * has played and failed to score; null is a club that has not played. A `?? 0`
   * here would turn every August fixture into a pair of goalless teams, and it
   * is the exact failure the pool-card note warns about — a default that is
   * itself a real value can never be detected.
   */
  goalsForPerGame: number | null;
  goalsAgainstPerGame: number | null;
  overallPlayed: number;
  overallStrip: ScoutFormLetter[];
};

export function VenueSplit({ home, away }: { home: VenueSide; away: VenueSide }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <SideColumn side={home} />
      <SideColumn side={away} />
    </View>
  );
}

function SideColumn({ side }: { side: VenueSide }) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.sm,
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Crest url={side.club.crestUrl} size={18} />
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.colors.ink,
          }}
        >
          {side.club.name}
        </RNText>
      </View>

      <Text variant="detail" color="slate">
        {side.venue === 'home' ? 'AT HOME' : 'AWAY'}
      </Text>

      {side.played === 0 ? (
        // ⚠ NOT "0 played" — a club with no games at this end yet has nothing to
        // average, and the overall strip below is what the reader gets.
        <Text variant="detail" color="slate">
          Nothing played {side.venue === 'home' ? 'at home' : 'away'} yet
        </Text>
      ) : (
        <>
          <FormStrip outcomes={side.strip} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Figure value={side.goalsForPerGame} />
            <Text variant="detail" color="slate">
              scored
            </Text>
            <View style={{ width: 2 }} />
            <Figure value={side.goalsAgainstPerGame} />
            <Text variant="detail" color="slate">
              let in
            </Text>
          </View>
          {/* ⚠ THE DENOMINATOR, ALWAYS. "2.4 a game" over one game is a scoreline
              wearing an average. */}
          <Text variant="detail" color="slate">
            a game, over {side.played}
          </Text>
        </>
      )}

      {/* The fallback, and it says what it is. */}
      {side.overallPlayed > 0 ? (
        <View style={{ gap: 5, marginTop: 2 }}>
          <Text variant="detail" color="slate">
            ALL GAMES
          </Text>
          <FormStrip outcomes={side.overallStrip} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * ⚠ A NULL AVERAGE IS AN EM DASH, NOT A ZERO. See `VenueSide` — the two mean
 * opposite things and only one of them is about how the club has played.
 */
function Figure({ value }: { value: number | null }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: MONO_BOLD,
        fontSize: 15,
        color: theme.colors.ink,
        fontVariant: ['tabular-nums'],
      }}
    >
      {value == null ? '—' : value.toFixed(1)}
    </RNText>
  );
}
