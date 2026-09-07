// =============================================================
// A player's name, at the width a timeline row actually has
// =============================================================
// ⚠ THE FEED IS NOT CONSISTENT, AND THAT IS THE WHOLE PROBLEM. Measured across
// production's 2,269 `match_events` rows on 2026-09-07:
//
//   47.2%  the provider ALREADY abbreviated it   'B. Leno', 'I. Ruiz de Galarreta'
//   45.1%  two words                             'Pierre-Emerick Aubameyang'
//    4.4%  three or more                         'Ignacio Ezequiel Agustín Fernández Carballo'
//    3.3%  a single token                        'Richarlison'
//
// So "show the full name" is not a thing the data can do: for nearly half the
// rows there is no fuller name stored, and the longest is 43 characters against
// a column that holds about 15.
//
// The rule below is Ryan's: prefer a TWO-WORD name, abbreviate the forename
// when that will not fit, and fall back to the surname alone when even that is
// too long. Every shape above lands somewhere sensible and nothing truncates.
//
// ⚠ MEASURED IN CHARACTERS, NOT POINTS, and deliberately. Measuring the real
// text needs a layout pass (`onTextLayout`), which means rendering the long
// form first and reflowing — a visible flicker on every row of a timeline that
// can be forty rows long. A character budget is stable, testable without
// mounting anything, and wrong only at the margin.
//
// ⚠ PURE: nothing here imports `react-native`. See the vitest config's rule.
// =============================================================

/**
 * How many characters a name column fits.
 *
 * The timeline gives each side roughly 95pt on a 375pt phone — 335 of card,
 * less 32 of padding, less the 44 rail and the two 34pt minute columns, halved
 * — and at 13px semibold that is about fifteen characters. Sixteen is one over,
 * on the reasoning that a name landing exactly on the limit reads better whole
 * than abbreviated, and Nunito's digits and lowercase run narrower than the
 * average this was derived from.
 */
export const NAME_BUDGET = 16;

/** 'B.' — a forename the provider has already reduced to an initial. */
function isInitial(token: string): boolean {
  return /^[A-Z]\.?$/.test(token) || /^[A-Z]\.$/.test(token);
}

/**
 * The fullest form of a name that fits.
 *
 * The ladder, in order:
 *   1. a single token stands as it is                  'Richarlison'
 *   2. first + last, when it fits                      'Bruno Fernandes'
 *   3. the forename cut to an initial                  'P. Aubameyang'
 *   4. the surname alone                               'Okon-Engstler'
 *
 * ⚠ FIRST AND LAST, NOT THE FIRST TWO. A three-part name is usually forename
 * plus a compound surname — 'Ignacio Ezequiel … Fernández Carballo' — so taking
 * the first two words would produce 'Ignacio Ezequiel', which is two forenames
 * and identifies nobody.
 *
 * ⚠ A NAME ALREADY REDUCED TO AN INITIAL CANNOT BE REDUCED AGAIN. Step 3 is
 * skipped for those; 'I. Ruiz de Galarreta' goes straight to 'I. Galarreta'
 * rather than to the nonsense 'I. Galarreta' via an initial of an initial.
 */
export function displayPlayerName(name: string | null, budget: number = NAME_BUDGET): string {
  if (!name) return '';
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];

  const first = tokens[0];
  const last = tokens[tokens.length - 1];

  const two = `${first} ${last}`;
  if (two.length <= budget) return two;

  // Nothing left to cut from an initial — drop to the surname.
  if (isInitial(first)) return last;

  const abbreviated = `${first[0]}. ${last}`;
  return abbreviated.length <= budget ? abbreviated : last;
}
