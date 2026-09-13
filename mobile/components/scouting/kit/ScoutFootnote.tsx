import { View } from 'react-native';

import { Text } from '@/components/ui';

// =============================================================
// The sample, and the scope, stated
// =============================================================
// A record over eleven meetings and one over forty are different kinds of claim,
// and the difference is invisible unless the report says so. Same call the
// dossier makes about revealed picks.
//
// ## ⚠⚠ THE CROWD'S SCOPE NOTE BELONGS HERE, AND IT USED TO BE RED
//
// The crowd card ended with "picks from across every pool on SportPool — never
// your own" inside a RED-tinted box. Red is what the same sheet uses for a
// defeat four cards earlier, so the feature's best reassurance read as an error
// state on the one card that most needs to feel trustworthy.
//
// It is not a warning and it is not a finding. It is a statement of scope, which
// is what a footnote is for, and slate is what a footnote is.
//
// ⚠ IT IS STILL LOAD-BEARING COPY. A member seeing a split beside a fixture will
// assume it is their pool unless told otherwise, and their pool is exactly what
// it must never be — picks reveal per matchweek and the Showdown draw is sealed.
// Moving it out of the red box must not quietly drop it.
// =============================================================

export function ScoutFootnote({ lines }: { lines: (string | null | undefined)[] }) {
  // ⚠ FILTERS EMPTIES RATHER THAN RENDERING A BLANK LINE. Callers build these
  // conditionally — "2 friendlies not counted" only exists sometimes — and a
  // falsy entry in the middle would otherwise open a gap in the block.
  const shown = lines.filter((l): l is string => !!l && l.trim().length > 0);
  if (shown.length === 0) return null;

  return (
    <View style={{ marginHorizontal: 20, gap: 2 }}>
      {shown.map((line) => (
        <Text key={line} variant="detail" color="slate">
          {line}
        </Text>
      ))}
    </View>
  );
}
