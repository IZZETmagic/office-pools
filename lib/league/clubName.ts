/**
 * Club names, shortened for narrow screens.
 *
 * ## Why this exists at all
 *
 * api-football ships a `short_name` field and it is useless here: on the
 * Premier League 2026/27 season it is byte-identical to `name` for all twenty
 * clubs. So "Manchester United" arrives at a 375px table as "Manchester Unit…",
 * and the ellipsis eats the half that distinguishes it from Manchester City.
 *
 * ## Why rules and not a lookup table
 *
 * A map of twenty club names would be a Premier League table wearing a general
 * name, and this codebase has already paid for that mistake once — migration
 * 089 exists because the qualification bands were hardcoded to England's 4-and-3
 * and would have been wrong for the first competition that differed.
 *
 * These are WORD-level substitutions instead. "Manchester" shortens to "Man"
 * wherever it appears, so Manchester United and Manchester City are handled by
 * one rule, and Sheffield United would be handled the day the Championship
 * lands without anybody adding a row. A name that matches nothing comes back
 * unchanged, which is the right answer for Arsenal, Everton and Leeds.
 *
 * ## The forms themselves
 *
 * Taken from how the competition writes its own fixtures rather than invented:
 * premierleague.com uses "Man Utd" and "Nott'm Forest", ESPN and FotMob use
 * "Nottm Forest". "Manchester" → "Man" is the one that does the real work, and
 * `United` is deliberately left alone — "Man United" reads more naturally than
 * "Man Utd" at the size we use it, and it is the form Ryan asked for.
 */

/**
 * Ordered, so the multi-word rules get first refusal — "Wolverhampton
 * Wanderers" has to become "Wolves" before anything tries to shorten
 * "Wolverhampton" on its own.
 */
const SHORTENINGS: ReadonlyArray<readonly [RegExp, string]> = [
  // Whole-name forms, where the short version is not a substring of the long one.
  [/\bWolverhampton Wanderers\b/i, 'Wolves'],
  [/\bBrighton & Hove Albion\b/i, 'Brighton'],
  [/\bWest Bromwich Albion\b/i, 'West Brom'],
  [/\bTottenham Hotspur\b/i, 'Tottenham'],

  // Word-level. These carry across competitions.
  [/\bManchester\b/i, 'Man'],
  [/\bNottingham\b/i, "Nott'm"],
  [/\bWolverhampton\b/i, 'Wolves'],
  [/\bSheffield\b/i, 'Sheff'],
  [/\bPeterborough\b/i, "Peterb'gh"],
  [/\bMiddlesbrough\b/i, "Middlesbro"],
]

/**
 * A shorter form of a club's name, or the name unchanged.
 *
 * Presentational only — never use this to match, group or key anything. The
 * club's id is its identity; this is a label.
 */
export function shortClubName(name: string): string {
  let out = name.trim()
  for (const [pattern, replacement] of SHORTENINGS) {
    if (pattern.test(out)) out = out.replace(pattern, replacement)
  }
  return out
}
