import { clubColorFromCrestUrl, fixturePalette } from '@/lib/design/clubColors';
import { useTheme } from '@/theme';

// =============================================================
// What the two clubs in a fixture wear, anywhere in scouting
// =============================================================
// ⚠⚠ IT LIVES IN THE KIT BECAUSE THE GUARD SAID SO, AND THE GUARD WAS RIGHT.
// This was written inline in `ScoutReport`, which put `theme.colors.accent` in
// a file outside the kit and tripped `scoutKit.guard.test.ts` — the test whose
// whole point is that a colour decision is made once, in one place, rather than
// in fifteen call sites that are each locally reasonable. A fallback colour is
// still a colour choice even when it is never drawn.
//
// ⚠ THE AWAY SIDE CHANGES KIT. `fixturePalette` is the app-wide rule: when the
// away club's colour reads as the home club's — the same shade, or merely the
// same family — it wears its 2026/27 change colour instead. Scouting does not
// get its own version of that judgement.
//
// ⚠⚠ NULL IS THE ANSWER FOR "USE THE ORDINARY PALETTE", and every caller must
// treat it as all-or-nothing. Half a report in club colours and half in the
// scout tones is the exact regression `SplitBar`'s header describes.
//
// ⚠ BOTH CLUBS MUST BE KNOWN FIRST. `fixturePalette` returns the app's own pair
// whenever EITHER side is missing, which is right where two colours have to be
// told apart and wrong here: a cup opponent from outside the five leagues would
// take the home club's real colour away with it.
// =============================================================

export type FixtureColors = { home: string; away: string } | null;

export function useFixtureColors(
  homeCrestUrl: string | null | undefined,
  awayCrestUrl: string | null | undefined,
): FixtureColors {
  const theme = useTheme();
  if (!clubColorFromCrestUrl(homeCrestUrl) || !clubColorFromCrestUrl(awayCrestUrl)) return null;
  const palette = fixturePalette(homeCrestUrl, awayCrestUrl, {
    home: theme.colors.primary,
    away: theme.colors.accent,
  });
  return palette.usingClubColors ? { home: palette.home, away: palette.away } : null;
}
