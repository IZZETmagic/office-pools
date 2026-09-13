import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// One tendency, against what actually happens
// =============================================================
// ## ⚠ THE MARK IS THE POINT OF THE ROW, NOT THE FILL
//
// The bar says how often they do it; the gold mark says how often it happens.
// The gap between them is the entire finding — "predicts a draw 6%" is a fact
// about arithmetic, and "6%, and the mark is over at 25%" is something you can
// act on. Neither half renders without the other.
//
// ⚠ BOTH VALUES ARE NUMBERS HERE, NOT PRE-FORMATTED STRINGS. They used to arrive
// formatted, which is why this card had no bars at all: a component handed
// "2.8 a game" cannot place a mark on a track. Formatting moved to the caller's
// `format`, and the caller also owns the SCALE — percentages run to 100 and
// goals do not.
//
// ⚠ EVERY VALUE IS THE SAME COLOUR, DELIBERATELY. Colouring the number by how
// far it sits from reality would be the screen telling somebody they are wrong,
// and under-calling the draw is a habit rather than a mistake. The bar and the
// mark already show the size of the gap; the colour does not need to score it.
// =============================================================

export function Comparison({
  label,
  theirs,
  reality,
  max,
  format,
  /** "they predict" / "you predict" — the dossier is also pointed at yourself. */
  who,
  realityLabel,
  first,
}: {
  label: string;
  theirs: number | null;
  reality: number | null;
  max: number;
  format: (v: number) => string;
  who: string;
  realityLabel: (v: number) => string;
  first?: boolean;
}) {
  const theme = useTheme();
  const palette = useScoutPalette();

  // ⚠ BOTH HALVES OR NEITHER. One number alone is not the finding this row
  // exists to make, and half a comparison reads as a claim it is not making.
  //
  // ⚠⚠ `== null`, NOT `=== null`. A missing key is `undefined`, which passes a
  // strict null check and then draws a bar at `undefined / max` — NaN, which
  // React renders as a width of nothing and a label reading "NaN". `StandingCard`
  // shipped exactly that and drew "of undefined in the pool".
  if (theirs == null || reality == null) return null;
  if (!Number.isFinite(theirs) || !Number.isFinite(reality)) return null;

  const share = (v: number) => Math.max(0, Math.min(1, v / max));

  return (
    <View
      style={{
        paddingVertical: 12,
        borderTopWidth: first ? 0 : 0.5,
        borderTopColor: withOpacity(theme.colors.mist, 0.6),
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}
      >
        <Text variant="body" style={{ flex: 1 }}>
          {label}
        </Text>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 16,
            color: palette.subject.fg,
            fontVariant: ['tabular-nums'],
          }}
        >
          {format(theirs)}
        </RNText>
      </View>

      {/* ---- the track ---------------------------------------------------- */}
      <View
        style={{
          height: 6,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.slate, 0.18),
          // ⚠ NOT `overflow: hidden`. The mark is TALLER than the track on
          // purpose — it has to read as a line drawn across the bar rather than
          // as a segment of it — and clipping would cut it back to 6pt.
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            // ⚠ A PERCENTAGE STRING, NOT A MEASURED WIDTH. The row has no
            // `onLayout` and needs none; Yoga resolves this against the track,
            // which is already full-width.
            width: `${share(theirs) * 100}%`,
            borderRadius: theme.radii.pill,
            backgroundColor: palette.subject.fg,
          }}
        />

        {/* ⚠ THE MARK SITS ON TOP OF THE FILL, so it stays visible when the two
            values are close — which is exactly when the row matters most. */}
        <View
          style={{
            position: 'absolute',
            left: `${share(reality) * 100}%`,
            top: -4,
            width: 3,
            height: 14,
            marginLeft: -1.5,
            borderRadius: 1.5,
            backgroundColor: palette.reality.fg,
          }}
        />
      </View>

      {/* ---- what the two ends mean --------------------------------------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 8,
        }}
      >
        <Text variant="detail" color="slate" numberOfLines={1} style={{ flexShrink: 1 }}>
          {who} {format(theirs)}
        </Text>
        {/* ⚠ THE SAME GOLD AS THE MARK, which is what ties the sentence to the
            line on the track. Without the colour match it reads as a second,
            unrelated caption. */}
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            lineHeight: 15,
            color: palette.reality.fg,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {realityLabel(reality)}
        </RNText>
      </View>
    </View>
  );
}
