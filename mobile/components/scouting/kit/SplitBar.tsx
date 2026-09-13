import { View } from 'react-native';

import { Text } from '@/components/ui';
import { splitShares } from '@/lib/scoutTone';
import { useTheme } from '@/theme';

import { useScoutPalette } from './tone';

// =============================================================
// Home / draw / away — one encoding, every split, every surface
// =============================================================
// ## ⚠⚠ THIS REPLACES THREE DIFFERENT ENCODINGS OF THE SAME FACT
//
// Before the kit, a three-way split was drawn:
//   · green / silver / red    in the pairing bar   (`MatchScoutSheet`)
//   · blue / silver / gold    in the crowd bar     (two cards below it, same sheet)
//   · club colours            on the match-detail tab (`ScoutingTab`)
//
// So Arsenal was green in one bar and blue in the next, and gold stopped meaning
// "the finding" and became Chelsea. Worse, green-for-the-home-club is a value
// judgement — "Arsenal = good" — that the card is explicitly not making.
//
// ## ⚠ THE POINT IS NOT TIDINESS, IT IS A COMPARISON THAT DID NOT EXIST
//
// Once the history bar and the crowd bar share an encoding they can be STACKED,
// and the reader sees in one glance that HISTORY SAYS HOME AND THE CROWD SAYS
// AWAY. That is the most interesting thing the scout report knows, and it was
// unreadable purely because the two bars were drawn in different colours four
// cards apart.
//
// ## ⚠ A SPLIT BAR IS ONLY HONEST WHERE THE PARTS ARE ONE WHOLE
//
// Both callers qualify: every meeting is exactly one of won/drawn/lost, and
// every pick is exactly one of home/draw/away, so the segments total the
// denominator by construction. This must not migrate to the stats tab, where
// possession and shots are not shares of anything.
// =============================================================

export type SplitCounts = {
  home: number;
  draw: number;
  away: number;
};

export function SplitBar({
  /** What this bar is measuring — "At the Emirates", "How SportPool picked it". */
  caption,
  /** The denominator, on the right of the caption row. "11 meetings", "412 picks". */
  note,
  counts,
  /** Names for the key. The key is what carries identity; the colours are a lookup. */
  names,
  /**
   * `count` prints "6 Arsenal"; `pct` prints "Arsenal 41%".
   *
   * ⚠ A PERCENTAGE IS NOT ALWAYS SUPPORTABLE. Over eleven meetings a count is
   * the honest unit and the caller should say so by choosing `count`.
   */
  keyFormat = 'count',
}: {
  caption?: string;
  note?: string;
  counts: SplitCounts;
  names: { home: string; draw: string; away: string };
  keyFormat?: 'count' | 'pct';
}) {
  const theme = useTheme();
  const palette = useScoutPalette();

  // ⚠ COUNTS IN, PERCENTAGES OUT, AND THE DIVISION HAPPENS ONCE — see
  // `splitShares`. The flex weights are the raw counts, so the bar stays exact
  // whatever the labels round to.
  const shares = splitShares(counts.home, counts.draw, counts.away);
  const label = [names.home, names.draw, names.away];

  return (
    <View>
      {caption || note ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 8,
          }}
        >
          {caption ? (
            <Text variant="body" color="slate" style={{ flexShrink: 1 }}>
              {caption}
            </Text>
          ) : null}
          {note ? (
            <Text variant="detail" color="slate">
              {note}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', height: 9, gap: 2 }}>
        {shares.map((s) => (
          <Segment key={s.tone} flex={s.flex} color={palette[s.tone].fg} />
        ))}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 9 }}>
        {shares.map((s, i) => (
          <View
            key={s.tone}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: theme.radii.pill,
                backgroundColor: palette[s.tone].fg,
              }}
            />
            <Text variant="body" numberOfLines={1}>
              {keyFormat === 'pct'
                ? // ⚠ `?? 0` IS SAFE HERE AND ONLY HERE: a null pct means the
                  // whole split is empty, and this branch is not reached — the
                  // caller draws a sentence instead of an empty bar.
                  `${label[i]} ${s.pct ?? 0}%`
                : `${s.flex} ${label[i]}`}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * ⚠ A ZERO-WIDTH SEGMENT MUST NOT RENDER. `flex: 0` collapses the view but
 * leaves the parent's 2pt `gap` beside it, which reads as a hairline of a colour
 * that should not be on the bar at all.
 */
function Segment({ flex, color }: { flex: number; color: string }) {
  const theme = useTheme();
  if (flex <= 0) return null;
  return (
    <View style={{ flex, backgroundColor: color, borderRadius: theme.radii.pill }} />
  );
}
