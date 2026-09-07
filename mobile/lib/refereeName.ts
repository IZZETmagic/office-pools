// =============================================================
// The referee, as a name rather than as a record
// =============================================================
// api-football sends the referee as "Chris Kavanagh, England" — the name and
// the official's country, comma-separated. Beside a Premier League fixture the
// country is noise: every referee in it is English, and the row already sits
// under the competition's own name.
//
// ⚠ STORED WHOLE, TRIMMED AT RENDER. The country is real information for a
// European tie and the column keeps it; this only decides what the card shows.
// The same rule the timeline follows for player names, and for the same reason
// — a faithful column and a narrow row are different problems.
//
// ⚠ PURE: nothing here imports `react-native`.
// =============================================================

/**
 * "Chris Kavanagh, England" → "Chris Kavanagh".
 *
 * ⚠ SPLIT ON THE LAST COMMA, NOT ON THE STRING "England". The Premier League
 * has a referee called Darren England, and the feed sends him as
 * "Darren England, England" — anything matching on the country's name eats
 * half of his. Taking everything before the final comma leaves it intact.
 *
 * ⚠ A NAME WITH NO COMMA IS RETURNED WHOLE, which is what keeps the already
 * stored short forms ("C. Kavanagh") rendering while the database catches up.
 */
export function refereeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const comma = trimmed.lastIndexOf(',');
  if (comma === -1) return trimmed;

  const name = trimmed.slice(0, comma).trim();
  // A value that is nothing but a country — ", England" — has no name in it to
  // show, so the raw string is better than an empty row.
  return name === '' ? trimmed : name;
}
