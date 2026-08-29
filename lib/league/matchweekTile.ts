// =============================================================
// THE MATCHWEEK TILE — which number the card shows, and what it says
// =============================================================
// Ryan, 2026-08-29, looking at a Premier League card on the second weekend of
// the season:
//
//   > Why is the premier league in Match week 3?? when teams are only just
//   > playing for the second time right now?
//
// Nothing was wrong with the data. MW2 locked at its own first kickoff on the
// Friday night, so MW3 was correctly the earliest unlocked matchweek and
// correctly the one the card's deadline pointed at. The tile was handed that
// number, labelled it "Matchweek", and captioned it "of 38".
//
// Two different questions had been collapsed into one:
//
//   what can I still pick   -> the OPEN matchweek     (MW3, locks Friday)
//   where is the season     -> the IN PLAY matchweek  (MW2, being played now)
//
// They agree from Monday night to Friday evening and disagree for the three
// days the football is actually on — which are the days a member looks at the
// card. The tile's job is orientation ("how far into the season is this pool"),
// so it answers the second question when there is an answer, and falls back to
// the first when there is not.
//
// It lives here rather than in either card because the pools list and the
// dashboard render the same tile from separate components, and the note on the
// dashboard one already admitted they "had drifted nowhere only by luck".
// =============================================================

export type MatchweekTileInput = {
  /** The matchweek being played. Null between rounds. */
  inPlayMatchweekNumber?: number | null
  /** The matchweek open for picks. Null once the season is over. */
  openMatchweekNumber?: number | null
  /** This season's length — 38 in England, 34 in Germany. */
  matchweekCount?: number | null
}

export type MatchweekTile = {
  /** The big number. Null renders as a dash. */
  number: number | null
  /** The line under it. Never empty — a bare dash explains nothing. */
  caption: string
}

export function matchweekTile(pool: MatchweekTileInput): MatchweekTile {
  const inPlay = pool.inPlayMatchweekNumber ?? null
  const open = pool.openMatchweekNumber ?? null

  // ⚠ IN PLAY WINS. It is the more specific fact and the only one that can
  // contradict what the member is watching.
  if (inPlay !== null) return { number: inPlay, caption: 'in play' }

  // Neither: every matchweek is played, so the season is done. Said plainly
  // rather than left as a bare dash.
  if (open === null) return { number: null, caption: 'Season over' }

  // Between rounds. "of 38" is the orientation the tile was built for, and the
  // card's own clock says when this one locks — so the caption does not need to
  // repeat the deadline.
  return { number: open, caption: pool.matchweekCount ? `of ${pool.matchweekCount}` : 'this week' }
}
