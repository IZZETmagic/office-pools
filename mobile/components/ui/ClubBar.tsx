import { View } from 'react-native';

import { clubBarNeedsHairline, clubColorFromCrestUrl } from '@/lib/design/clubColors';
import { useTheme, withOpacity } from '@/theme';

/**
 * A club's colour, as a bar — the one shape that replaced its crest.
 *
 * ⚠ ONE COMPONENT, FIVE SURFACES. This was inlined at every call site when the
 * crests came out on 2026-09-19, and within a day the sizes had already drifted
 * (4×24 on the Results row against 6×30 in Pick'em). It is the club's identity
 * everywhere it appears; it should be one object.
 *
 * ⚠⚠ AND THE HAIRLINE IS WHY IT HAD TO BE. A bar is a SHAPE, not text: WCAG
 * asks 3:1 of it, and Leeds' yellow measures 1.31 against the card. Without an
 * outline a yellow club renders as a gap in the row rather than as a club. Only
 * the light colours take one — see `clubBarNeedsHairline` — so nothing else
 * gains a border it does not need.
 */
export function ClubBar({
  /** The club's crest URL. It draws nothing; it is how the club id is found. */
  url,
  /**
   * An explicit colour, overriding the one the URL resolves to.
   *
   * ⚠ THIS IS HOW A CHANGE KIT REACHES THE BAR. `fixturePalette` decides what
   * the two sides of a FIXTURE wear — the away club changes when its colour
   * reads as the home club's — and that decision needs to see BOTH clubs,
   * which a bar drawing itself from one URL cannot. The caller that knows
   * about both passes the answer in; every other caller passes nothing and
   * gets the club's own colour exactly as before.
   */
  colour: override,
  height = 30,
  width = 6,
}: {
  url: string | null | undefined;
  colour?: string | null;
  height?: number;
  width?: number;
}) {
  const theme = useTheme();
  const colour = override ?? clubColorFromCrestUrl(url);

  // A club we hold no colour for — the slot survives so the column stays true.
  if (!colour) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: 999,
          backgroundColor: withOpacity(theme.colors.slate, 0.35),
        }}
      />
    );
  }

  // ⚠ THE SURFACE DECIDES, NOT A HARD-CODED CARD. Which clubs need an outline
  // inverts with the theme: pale ones on the light card, near-black ones on the
  // dark. See `clubBarNeedsHairline`.
  const hairline = clubBarNeedsHairline(colour, theme.colors.surface);
  return (
    <View
      style={{
        width,
        height,
        borderRadius: 999,
        backgroundColor: colour,
        // ⚠ INSIDE THE WIDTH, not outside it. A border grows the box in RN
        // unless the width already accounts for it, and these bars sit in fixed
        // slots that the surrounding columns are measured against.
        borderWidth: hairline ? 1 : 0,
        // ⚠ AND THE OUTLINE IS THE THEME'S INK, which is dark on the light card
        // and light on the dark one — so it separates in both rather than
        // vanishing in one.
        borderColor: hairline ? withOpacity(theme.colors.ink, 0.25) : 'transparent',
      }}
    />
  );
}
