import { Text as RNText, StyleSheet, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// A labelled figure — the workhorse row of every scout card
// =============================================================
// ## ⚠⚠ IT REPLACES TWO ROWS THAT DISAGREED ABOUT THEIR OWN ARGUMENT ORDER
//
// `MatchScoutSheet` had `Line` (label → note → value) and `Dossier` had `Row`
// (label → value → note). Same job, opposite layout, and `Row` carried the
// argument for why it was right:
//
//   "VALUE FIRST, THEN THE SHARE. The scoreline is the answer and the share is
//    its footnote; reading '4 of 20 · 1–2' puts the qualifier before the thing
//    it qualifies."
//
// That reasoning is correct and it applies to both, so `Line` loses. Every scout
// row now reads label · value · note.
//
// ⚠ THE NOTE IS THE DENOMINATOR AND IT IS NOT DECORATION. "2–1 in 25%" means
// nothing without "(3 of 12)" beside it; the design note makes carrying the `n`
// inline a hard rule with no exceptions.
// =============================================================

export function ScoutRow({
  label,
  value,
  note,
  /**
   * The one line on this card worth reading aloud.
   *
   * ⚠ AT MOST ONE PER CARD. Gold means "the finding"; two findings on one card
   * means neither is.
   */
  finding,
  /** A stated absence — "Never". Quieter than a figure, because it is not one. */
  muted,
  first,
}: {
  label: string;
  value: string;
  note?: string;
  finding?: boolean;
  muted?: boolean;
  /** Suppresses the divider. The first row in a group draws no top rule. */
  first?: boolean;
}) {
  const theme = useTheme();
  const palette = useScoutPalette();

  const color = finding
    ? palette.finding.fg
    : muted
      ? theme.colors.slate
      : palette.neutral.fg;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
        borderTopColor: withOpacity(theme.colors.mist, 0.8),
      }}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 15,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      {note ? (
        <Text variant="detail" color="slate">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A group of rows, so the first one knows it is first.
 *
 * ⚠ THE DIVIDER LIVES ON THE ROW, NOT BETWEEN THEM. A `gap` plus separators
 * double-counts the spacing, and a conditional separator between children is
 * exactly the off-by-one that leaves a stray rule under the last row.
 */
export function ScoutRows({ children }: { children: React.ReactNode }) {
  return <View>{children}</View>;
}
