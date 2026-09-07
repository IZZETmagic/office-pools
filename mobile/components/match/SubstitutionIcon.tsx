import { ArrowLeftRightIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { View } from 'react-native';

import { useTheme } from '@/theme';

// =============================================================
// A substitution, in two colours
// =============================================================
// One glyph, two meanings: the top arrow is the player going OFF and the
// bottom one the player coming ON — so it has to be red above and green below,
// which is the one thing the shared `Icon` cannot do. `HugeiconsIcon` paints
// every path in a single `currentColor`, and that is the whole reason this
// component exists rather than another entry in `ICON_MAP`.
//
// ⚠ THE TWO HALVES ARE SPLIT GEOMETRICALLY, NOT BY PATH INDEX. The obvious
// implementation filters `ArrowLeftRightIcon`'s four paths — keys 2 and 3 are
// the top line and its head, 0 and 1 the bottom — and it would work today and
// break silently on any package update that reorders or redraws them, painting
// an arrow the wrong colour with nothing failing. Instead the FULL glyph is
// drawn twice and each copy is clipped to half the box, which cannot care how
// the paths are ordered. The glyph is a 24-unit box with the arrows at y≈4-10
// and y≈14-20, so the cut at the midpoint is clean either way.
//
// ⚠ AND THE FLIP IS WHY IT TAKES A SIDE. Mirroring for the away team is not
// decoration: it points the RED arrow at that team's own column, which is where
// the departing player's name is. Home names sit left of the rail and away
// names right, so an unflipped icon would point the "off" arrow away from the
// player it describes on half the rows.
//
// ⚠ Flipping does not move top and bottom. Red stays above and green below on
// both sides; only the direction mirrors.
// =============================================================

export function SubstitutionIcon({
  size = 14,
  /** True for an away substitution — mirrors the arrows horizontally. */
  flip = false,
}: {
  size?: number;
  flip?: boolean;
}) {
  const theme = useTheme();
  const half = size / 2;

  // The glyph is drawn thin at this scale; a touch more weight keeps both
  // arrows legible at 14px, where the default 1.5 nearly disappears.
  const stroke = 2.2;

  return (
    <View
      style={{
        width: size,
        height: size,
        transform: flip ? [{ scaleX: -1 }] : undefined,
      }}
    >
      {/* Top half — the player coming off. */}
      <View style={{ height: half, overflow: 'hidden' }}>
        <HugeiconsIcon
          icon={ArrowLeftRightIcon}
          size={size}
          color={theme.colors.red}
          strokeWidth={stroke}
        />
      </View>
      {/* Bottom half — the player coming on. The same glyph, pulled up by half
          its height so the clip window lands on the lower arrow. */}
      <View style={{ height: half, overflow: 'hidden' }}>
        <View style={{ marginTop: -half }}>
          <HugeiconsIcon
            icon={ArrowLeftRightIcon}
            size={size}
            color={theme.colors.green}
            strokeWidth={stroke}
          />
        </View>
      </View>
    </View>
  );
}
