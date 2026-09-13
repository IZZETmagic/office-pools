import { View } from 'react-native';

import { Text } from '@/components/ui';
import { useTheme } from '@/theme';

// =============================================================
// The card every scout report is made of
// =============================================================
// ⚠ IT WAS DEFINED THREE TIMES, IDENTICALLY — in `MatchScoutSheet`, `Dossier`
// and `ScoutingTab`, each a private `function Card()` with the same surface,
// radius, shadow and header padding. Three copies is three places for a padding
// change to be applied twice and missed once.
//
// ⚠ `surface` ON `snow`. The sheet body is a screen (`ScoutSheet` sets `snow`),
// so a card in it is just a card. Do not give this a border as well as a shadow;
// border, fill, radius and shadow each say "separate object" and spending all
// four flattens the hierarchy rather than sharpening it.
// =============================================================

export function ScoutCard({
  title,
  /**
   * What this card is counted over — "This pool", "All time", "Platform-wide".
   *
   * ⚠ OPTIONAL, BUT PREFER SAYING IT. A member reading a figure assumes the
   * narrowest scope they can think of, and for the crowd bar the narrowest
   * scope is exactly the one it must never be.
   */
  scope,
  children,
}: {
  title: string;
  scope?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        <Text variant="cardTitle">{title}</Text>
        {scope ? <ScopeTag label={scope} /> : null}
      </View>
      {children}
    </View>
  );
}

/**
 * ⚠ DELIBERATELY QUIET. The scope is a qualifier on the title, not a finding —
 * it earns no colour, and a loud tag beside every card title would compete with
 * the one gold line the card is allowed.
 */
function ScopeTag({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.xs,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}
    >
      <Text variant="detail" color="slate">
        {label.toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * The body of a card: consistent horizontal padding and a bottom edge.
 *
 * ⚠ A SEPARATE COMPONENT BECAUSE SOME CARDS DO NOT WANT IT — a list of rows
 * runs to the card's edges and manages its own dividers.
 */
export function ScoutCardBody({
  gap = 13,
  children,
}: {
  gap?: number;
  children: React.ReactNode;
}) {
  return (
    <View style={{ paddingHorizontal: 16, paddingBottom: 15, gap }}>{children}</View>
  );
}

/**
 * A sentence where a table would have been.
 *
 * ⚠ THE WHOLE CARD, NOT AN EMPTY TABLE WITH A CAPTION. Two clubs who have never
 * met is a real answer to the question the pairing card asks, and six em-dashes
 * read as broken where a sentence reads as news.
 */
export function ScoutBlurb({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 15 }}>
      {children}
    </Text>
  );
}
