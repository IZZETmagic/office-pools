// =============================================================
// A competition's colour and NAME, down the left edge of a pool card
// =============================================================
// The RN half of components/competitions/CompetitionRail.tsx. Same geometry,
// same fallback, same reason for existing: neither pool card names its
// competition, so the rail is the whole answer to "which league is this?".
//
// ⚠ THE MARK IS GONE, AND THE RAIL IS BETTER FOR IT (2026-09-19). Six league
// logos used to ride here — the provider's artwork, recoloured by
// scripts/build-competition-silhouettes.ts and bundled into both binaries. See
// drafts/2026-09-13_ip_exposure_audit.md §2. A competition's NAME is a fact and
// free to use referentially; its device mark is not.
//
// It also fixes the complaint this file opened with. The old comment said "the
// card never names its competition, so the rail is the whole answer" — and then
// answered it with a shape you had to already recognise. Now it answers with
// the words.
//
// ## Why the height is measured
//
// RN has no `writing-mode`, so vertical type is a rotated <Text> — and a
// rotated Text still needs a WIDTH equal to the rail's height before it can be
// turned. The rail deliberately has no definite height (see `alignSelf` below),
// so the height is measured with onLayout and fed back. One extra render on
// mount, which is why the text fades in rather than popping.
// =============================================================

import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { fontFamilies } from '@/theme/typography';

import { getCompetitionName, getPoolStripe } from '@/lib/design/competition';

/**
 * Rail geometry per size, from the web's SIZES — both numbers are MEASURED
 * rather than chosen.
 *
 * ⚠ `compact` IS THE HOME CARD, `default` THE POOLS TAB. The old note here said
 * compact traded mark legibility for width, because at 22px the wordmark-shaped
 * LOGOS stopped resolving. Type does not have that problem: the name is set
 * along the rail's LENGTH, so the rail's width only has to clear the cap
 * height. Both sizes now carry the full name. Ryan's call, 2026-09-19.
 */
const SIZES = {
  default: { rail: 46, font: 12, padV: 10 },
  compact: { rail: 30, font: 10, padV: 8 },
} as const;

export type RailSize = keyof typeof SIZES;

/** Tracking, as a share of the font size. Uppercase Nunito Black needs air. */
const TRACKING = 0.16;

/**
 * Width of one uppercase character, as a share of the font size, tracking
 * included. Measured off Nunito Black caps rather than guessed — it only has to
 * be close enough to decide whether the longest name still fits.
 */
const CHAR_W = 0.78;

type Props = {
  /** `tournaments.external_league_id`. Null renders the unthemed slate. */
  externalLeagueId?: number | null;
  size?: RailSize;
};

/**
 * The bar down the left edge of a pool card.
 *
 * ⚠ THE NARROW FALLBACK IS LOAD-BEARING. A competition with no name renders the
 * original 5px colour bar rather than a blank 30px block — and that is a real
 * case, not a defensive branch: a league is a row rather than a deploy, so one
 * can be created in the admin and picked in the wizard before anyone names it.
 */
export function CompetitionRail({ externalLeagueId, size = 'compact' }: Props) {
  const stripe = getPoolStripe(externalLeagueId);
  const name = getCompetitionName(externalLeagueId);
  const [railH, setRailH] = useState(0);

  if (!name) {
    return (
      <LinearGradient
        colors={stripe}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ width: 5, alignSelf: 'stretch' }}
      />
    );
  }

  const { rail, font, padV } = SIZES[size];
  const run = Math.max(0, railH - padV * 2);

  // ⚠ SHRINK RATHER THAN TRUNCATE. "CHAMPIONS LEAGUE" is 16 characters and wants
  // ~150pt at the default size; a short card cannot give it that, and an
  // ellipsis down the side of a card reads as a bug. So the type steps down to
  // fit the rail it was given, with a floor — below 7pt it is decoration rather
  // than a word, and the plain bar is the more honest answer at that point.
  const wanted = name.length * font * CHAR_W;
  const fitted = run > 0 && wanted > run ? Math.max(7, (run / name.length) * (1 / CHAR_W)) : font;

  return (
    <LinearGradient
      colors={stripe}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      onLayout={(e: LayoutChangeEvent) => setRailH(e.nativeEvent.layout.height)}
      style={{
        width: rail,
        // ⚠ `alignSelf: 'stretch'`, NEVER `height: '100%'`. A percentage height
        // resolves against the nearest ancestor with a DEFINITE height, and a
        // pool card in a list has none — so it reached past the card to the
        // ScrollView's `flexGrow: 1` content container and the rail became
        // VIEWPORT-tall, dragging the card to full height with it. The home
        // card hid this for three days because it hard-codes `height: 180`.
        // Ryan caught it on his phone, 2026-09-05.
        alignSelf: 'stretch',
        // Stretch only fills the CROSS axis, so in a column parent (a harness
        // cell, a future header) the rail would collapse to nothing. The floor
        // is enough length to read a short name.
        minHeight: 96,
        overflow: 'hidden',
      }}
    >
      {/* ⚠ ABSOLUTE, SO THE ROTATION COSTS NO LAYOUT. A rotated Text keeps its
          UNROTATED box for layout purposes — a 150pt-wide box inside a 30pt
          rail — which would push the gradient open. Filling the rail absolutely
          and centring means the turn is purely visual. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {run > 0 ? (
          <Text
            numberOfLines={1}
            allowFontScaling={false}
            style={{
              width: run,
              textAlign: 'center',
              transform: [{ rotate: '-90deg' }],
              color: '#FFFFFF',
              fontFamily: fontFamilies.black,
              fontSize: fitted,
              letterSpacing: fitted * TRACKING,
            }}
          >
            {name}
          </Text>
        ) : null}
      </View>
    </LinearGradient>
  );
}
