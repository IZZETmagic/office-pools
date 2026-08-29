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
 *
 * ## What La Liga added, and what it did NOT
 *
 * Measured before adding anything: after shortening, the Premier League's
 * longest rendered name is "Nott'm Forest" at 13 characters. La Liga arrived
 * with "Deportivo La Coruna" at 19 and "Racing Santander" at 16 — roughly 50%
 * past what the 375px table was built for. Those two got rules.
 *
 * "Atletico Madrid" (15) did NOT, on the reasoning that two characters over
 * was cheaper to absorb than a rule.
 *
 * ## ⚠ That call was OVERTURNED on 2026-08-29, because the premise moved
 *
 * The 15-character allowance was measured against the 375px TABLE. The
 * dashboard's live card gives a name 98px — about 16 characters — and it shows
 * two names either side of a score rather than one per row. Measured across
 * every club in the four imported leagues, that left seven Bundesliga names and
 * two Spanish ones overrunning, "Borussia Mönchengladbach" at 24 characters
 * worst. So Germany got rules, and Atletico and Rayo got theirs.
 *
 * The restraint still stands for everything that FITS: "Crystal Palace" (14) is
 * the longest name now left alone, deliberately. What changed is the ceiling,
 * not the principle — a name earns a rule by being measured over it, never by
 * looking long.
 *
 * ⚠ ACCENTS ARE PARTLY IN SCOPE NOW, and only because the feed is inconsistent
 * about them. It ships "Alaves" and "La Coruna" bare while shipping "Bayern
 * München" and "Borussia Mönchengladbach" accented. The rules therefore match
 * both spellings of the German names. That is a matching concern, not a
 * rendering one: RESTORING an accent the feed omitted is still out of scope and
 * still belongs in ingestion or with the provider.
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

  // Spain, added with La Liga 2026-08-28. Both are the form LaLiga writes in
  // its own fixture lists, and both are whole-name forms rather than word rules
  // because neither word is worth shortening on its own: "Deportivo" prefixes
  // several unrelated clubs (Alaves is Deportivo Alaves) and "Santander" is a
  // place, not a shortenable component.
  //
  // The `[nñ]` is deliberate. The feed currently ships this name UNACCENTED —
  // "Deportivo La Coruna" — but that is a property of the provider, not of the
  // club, and a rule that silently stopped matching if the feed ever fixed its
  // encoding would fail the way this file is least able to notice: quietly, by
  // rendering a name three characters too long.
  [/\bDeportivo La Coru[nñ]a\b/i, 'Deportivo'],
  // ⚠ Known cost, accepted: Racing de Ferrol shortens to nothing and stays
  // "Racing Ferrol", so a table holding BOTH would show "Racing" and "Racing
  // Ferrol". They have never shared a division, and this is a label, never an
  // identity — but if they ever do, this rule is the thing to revisit.
  [/\bRacing Santander\b/i, 'Racing'],

  // Spain, second pass (2026-08-29). "Atletico Madrid" was declined the first
  // time on the grounds that the 375px TABLE held 15 characters — which was
  // true of the table, and is not true of the dashboard's live card, where a
  // name gets 98px. Ryan's call to add it. Both are the forms LaLiga writes.
  //
  // ⚠ Same caveat as Racing: several clubs outside the top flight are
  // "Atletico" something. This is a label, never an identity, and they have not
  // shared a division — but a promotion is the thing that would make this
  // rule wrong.
  [/\bAtl[eé]tico Madrid\b/i, 'Atletico'],
  [/\bRayo Vallecano\b/i, 'Rayo'],

  // Germany, added with the Bundesliga (2026-08-29). All seven are whole-name
  // forms rather than word rules, because the word worth keeping is the CITY
  // and the word being dropped is a sponsor, a founding year or a club-type
  // prefix that several unrelated clubs share — "Borussia" is Dortmund and
  // Mönchengladbach both, "Eintracht" is Frankfurt and Braunschweig, and a
  // word rule on either would collide the moment the second one is promoted.
  //
  // ⚠ THE UMLAUTS ARE REAL HERE, unlike La Liga. The feed ships "Bayern
  // München" and "Borussia Mönchengladbach" accented while it ships "Alaves"
  // and "La Coruna" bare — so these match both spellings, for the reason the
  // `[nñ]` on Deportivo already does: a rule that silently stopped matching if
  // the provider changed its encoding would fail by rendering a name twice as
  // long as the layout holds, and nothing would report it.
  [/\bBorussia M[öo]nchengladbach\b/i, 'Gladbach'],
  [/\bBorussia Dortmund\b/i, 'Dortmund'],
  [/\bEintracht Frankfurt\b/i, 'Frankfurt'],
  [/\bBayer Leverkusen\b/i, 'Leverkusen'],
  [/\bBayern M[üu]nchen\b/i, 'Bayern'],
  [/\b1899 Hoffenheim\b/i, 'Hoffenheim'],
  [/\bSC Paderborn 07\b/i, 'Paderborn'],

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
