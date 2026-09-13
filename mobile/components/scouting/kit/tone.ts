import type { ScoutTone } from '@/lib/scoutTone';
import { useTheme, withOpacity } from '@/theme';

// =============================================================
// The only file in scouting that knows what a colour is
// =============================================================
// `mobile/lib/scoutTone.ts` owns the vocabulary; this owns the mapping. Every
// other file in `components/scouting/` takes a `ScoutTone` and never touches
// `theme.colors` — which `lib/__tests__/scoutKit.guard.test.ts` enforces, so the
// grammar is a build failure rather than a convention.
//
// ⚠ ONE JOB PER COLOUR. If a card needs a meaning that is not in `ScoutTone`, it
// does not get a colour — it gets a label. Adding a tone here is a deliberate
// widening of the grammar and should be argued for, not slipped in.
// =============================================================

export type ToneColors = {
  /** Text, icons, and the fill of a solid bar segment. */
  fg: string;
  /** The wash behind a chip, pill or callout. Always derived from `fg`. */
  tint: string;
};

/**
 * How heavy a tint is, by what it sits behind.
 *
 * ⚠ ONE VALUE, NOT A PER-CARD CHOICE. Before the kit these ran from 0.08 to
 * 0.18 across five files with no reason for the difference, so a chip and a
 * callout carrying the same meaning read as different weights of claim.
 */
const TINT = 0.14;

/**
 * The grammar, resolved.
 *
 * ⚠ A HOOK RETURNING THE WHOLE RECORD, not a hook per tone — a component that
 * maps over a list of tones cannot call a hook inside the loop.
 */
export function useScoutPalette(): Record<ScoutTone, ToneColors> {
  const theme = useTheme();
  const t = theme.colors;

  return {
    // ---- outcome -----------------------------------------------------------
    // ⚠ THE ONLY PLACE GREEN MEANS "GOOD". It is a result that happened, from
    // the point of view of the side being described. Green is off limits
    // everywhere else in scouting — it spent a release also meaning "the home
    // club" and "this player has a rating", which is what cost it its meaning.
    win: { fg: theme.colors.green, tint: withOpacity(theme.colors.green, TINT) },
    draw: { fg: t.slate, tint: withOpacity(t.slate, TINT) },
    loss: { fg: theme.colors.red, tint: withOpacity(theme.colors.red, TINT) },

    // ---- side --------------------------------------------------------------
    // ⚠⚠ ONE ENCODING FOR EVERY THREE-WAY SPLIT, AND THAT IS THE WHOLE POINT.
    // The pairing bar drew it green/silver/red and the crowd bar two cards below
    // drew it blue/silver/gold, so Arsenal was green in one and blue in the
    // other. Sharing the encoding is not tidiness: it lets the history bar and
    // the crowd bar be STACKED, and the gap between them — history says home,
    // the crowd says away — is the most interesting thing the report knows.
    //
    // ⚠ THE COLOURS ARE A LOOKUP, NOT A MEANING. Position and the key below the
    // bar carry the identity; a club is not "good" for being drawn in blue.
    home: { fg: t.primary, tint: withOpacity(t.primary, TINT) },
    level: { fg: t.silver, tint: withOpacity(t.silver, TINT) },
    away: { fg: t.ink, tint: withOpacity(t.ink, TINT) },

    // ---- emphasis ----------------------------------------------------------
    // ⚠ AT MOST ONE FINDING PER CARD, and a card with nothing worth reading
    // aloud has no gold on it at all. Gold spent a release meaning five things —
    // the drought, signature figures, the away club, the reality mark and the
    // exact-score count — which is the same as meaning nothing.
    finding: { fg: theme.colors.accent, tint: withOpacity(theme.colors.accent, 0.1) },
    // ⚠ AMBER IS A CAVEAT AND NEVER ALSO A STATISTIC. It is the feature
    // admitting its own limits; a number wearing it reads as a warning.
    caveat: { fg: theme.colors.amber, tint: withOpacity(theme.colors.amber, 0.1) },

    // ---- comparison --------------------------------------------------------
    // ⚠ BLUE IS THEM, GOLD IS REALITY, and the gap between the two IS the
    // finding. "Predicts a draw 6%" is arithmetic; "6%, and the mark is over at
    // 25%" is something you can act on.
    subject: { fg: t.primary, tint: withOpacity(t.primary, TINT) },
    reality: { fg: theme.colors.accent, tint: withOpacity(theme.colors.accent, TINT) },

    // ---- everything else ---------------------------------------------------
    // ⚠ NEUTRAL IS `ink` ON `mist`, AND IT IS THE DEFAULT ON PURPOSE. A figure
    // has to EARN a colour. The player rating pill was green for every rating,
    // 6.2 and 8.4 alike, which made green decorative on the one card where it
    // was also load-bearing two cards above.
    neutral: { fg: t.ink, tint: t.mist },
  };
}
