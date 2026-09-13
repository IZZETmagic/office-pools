// =============================================================
// Who is actually playing well — the people half of a scout report
// =============================================================
// Migration 141 put forty players a fixture into `match_player_stats` — rating,
// minutes, assists, key passes, shots, tackles, duels, saves — at zero extra
// provider cost, because the bytes already arrive in the `/fixtures?ids=` bundle
// the sync pays for. Until this module nothing read it.
//
// ## ⚠⚠ GOALS DO NOT COME FROM THAT TABLE, AND THAT IS 141'S OWN WARNING
//
// The timeline and the player payload DISAGREE AT SOURCE — 428 goals credited
// to players against 430 in `match_events`, measured across 146 fixtures on the
// first backfill. Half a percent is invisible in an average and very visible on
// a leading scorer, which is the one number on this card a member would check
// against anywhere else. So goals are counted from `match_events`, which 141
// names as authoritative, and everything else from `match_player_stats`.
//
// ## ⚠⚠ THE NAME JOIN WAS SILENTLY EATING 90% OF GOALS — FIXED 2026-09-12
//
// `match_events` carries no player id at all (136 chose the side over a team FK
// and never added one), so the name is the only key available. This file used to
// assume that was safe because both sides come from one feed, and said a
// two-way spelling "would show a player twice, which is a visible bug rather
// than a silent one".
//
// Both halves of that were wrong. The provider uses a DIFFERENT CONVENTION PER
// ENDPOINT — the timeline files `K. Havertz`, the player payload files
// `Kai Havertz` — so an exact-string match does not double-count anybody. It
// finds nothing, the goal quietly lands on no one, and the player renders with
// zero goals. Measured against production before the fix:
//
//     417 of 463 goals could not be joined to a player at all
//
// So the danger list — `goals + assists` — was ranking almost purely on ASSISTS,
// and the most dangerous name in a squad routinely did not appear on it. Nothing
// errored and nothing looked broken.
//
// `playerNameKey` normalises both sides to `<initial>. <rest>`, unaccented and
// lower-cased. Re-measured after: 426 of 443 join. See the guard test.
//
// ## ⚠⚠ `is_starter` IS KNOWN-WRONG AND MUST NOT BE FILTERED ON
//
// The provider sends `substitute: false` for WHOLE SQUADS, so the column reads
// "everybody started" for some fixtures. `minutes > 0` is the honest test for
// "played", and it is what every filter here uses. An open bug, not a
// misunderstanding.
//
// ## ⚠ A NULL RATING IS AN UNUSED SUBSTITUTE, NOT A ZERO
//
// 199 of 800 sampled rows carry no rating because the player never came on.
// Treating those as 0 drags every squad average toward the bench; treating them
// as played inflates the appearance count. Both are excluded outright.
//
// ⚠ PURE: no client, no DB, no network. The route reads; this counts.
// =============================================================

/** One player's line from one fixture, off `match_player_stats`. */
export type PlayerStatRow = {
  externalPlayerId: number
  playerName: string
  /** Which club this row belongs to, resolved by the reader from side + fixture. */
  clubId: string
  position: 'G' | 'D' | 'M' | 'F' | null
  minutes: number | null
  rating: number | null
  assists: number | null
  keyPasses: number | null
  shotsOn: number | null
  duelsWon: number | null
  duelsTotal: number | null
  saves: number | null
  yellowCards: number | null
  redCards: number | null
}

/**
 * The join key for a player name, across two endpoints that disagree about how
 * to spell one.
 *
 * `Kai Havertz` and `K. Havertz` both become `k. havertz`.
 *
 * ⚠ EVERYTHING AFTER THE FIRST TOKEN IS THE SURNAME, not the last token.
 * `Maxim De Cuyper` must key the same as `M. De Cuyper`, and taking only the
 * final word would key one as `cuyper` and the other as `cuyper` by luck — but
 * `Jan Vertonghen Jr` and similar would diverge. Keeping the whole tail is both
 * simpler and more faithful to what the provider abbreviates.
 *
 * ⚠ A MONONYM HAS NO FIRST TOKEN TO ABBREVIATE. `Rodri`, `Ederson`, `Raphinha`
 * arrive identically from both endpoints, so they key as themselves.
 *
 * ⚠ ACCENTS ARE STRIPPED because the two endpoints do not agree about those
 * either — `Gündoğan` against `Gundogan`. NFD splits a letter from its combining
 * mark and the range below removes the marks.
 *
 * ## ⚠ WHAT THIS CANNOT DO
 *
 * Two players in ONE squad sharing an initial and a surname key the same, and
 * their goals would pool. There is no id to disambiguate with — the real fix is
 * an `external_player_id` on `match_events`, which is a migration and a
 * re-ingest. This is the cheap correct-in-practice version, and the 17 goals
 * that still fail to join after it are the honest measure of what it misses.
 */
export function playerNameKey(name: string): string {
  const clean = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()

  if (clean === '') return ''
  const gap = clean.indexOf(' ')
  if (gap === -1) return clean
  return `${clean[0]}. ${clean.slice(gap + 1)}`
}

/** One scoring event off `match_events`, which is authoritative for goals. */
export type GoalEventRow = {
  /** ⚠ The scorer, or for an own goal the player who put it in his own net. */
  playerName: string | null
  /** ⚠ THE SIDE THAT BENEFITS. For an own goal the feed already credits the
   *  right team, and the club below is resolved from that side — so an own goal
   *  must never be counted as a goal FOR the man who scored it. */
  clubId: string
  kind: 'goal' | 'own_goal' | 'penalty'
  assistName: string | null
}

/**
 * Minutes before a player's average rating is worth reporting.
 *
 * ⚠ A RATING OVER ONE CAMEO IS NOISE. A substitute who came on for eleven
 * minutes and touched the ball twice can carry a 7.4, and sorted against a
 * centre-half's season it wins. Roughly two full games is where the average
 * starts describing a player rather than an afternoon.
 */
export const MIN_MINUTES = 180

/**
 * How many names the in-form list shows.
 *
 * ⚠ FIVE, NOT THREE. Ryan, 2026-09-12: the card is one list per club now, so it
 * carries the depth the two lists used to split between them. Three was right
 * when a second section sat underneath it.
 */
const TOP_IN_FORM = 5

/**
 * How many names the danger list shows.
 *
 * ## ⚠⚠ NOTHING RENDERS THIS ANY MORE, AND IT STILL SHIPS
 *
 * The scout report folded to a single in-form list on 2026-09-12. `dangerMen` is
 * kept on the payload because an INSTALLED PHONE still reads it — the old
 * `match/PeopleCard` did `scout.dangerMen.length` with no guard, so sending
 * `undefined` would be a TypeError on every fixture for anybody who has not
 * taken the OTA. A phone outlives the deploy it was built against.
 *
 * ⚠ SO IT STAYS AT THREE. Widening it would change what those old bundles draw
 * for no reason. Remove the field only once the old bundle is gone, and remove
 * it from `mobile/lib/api.ts` at the same time.
 */
const TOP_DANGER = 3

export type PlayerForm = {
  externalPlayerId: number
  name: string
  position: 'G' | 'D' | 'M' | 'F' | null
  appearances: number
  minutes: number
  /** Mean of the rated appearances only. */
  rating: number
  goals: number
  assists: number
  keyPasses: number
}

export type SideScout = {
  clubId: string
  /**
   * Best average rating, minutes-qualified. Empty when nobody qualifies yet.
   *
   * ⚠ THE ONLY LIST THE SCOUT REPORT DRAWS as of 2026-09-12. Each row carries
   * goals and assists of its own, so a scorer is still visible here — he is just
   * ranked by how he has played rather than by what he has scored.
   */
  inForm: PlayerForm[]
  /**
   * Most goals + assists. ⚠ Goals from the timeline, assists from the stats.
   *
   * ⚠⚠ LEGACY — nothing renders this. Kept on the payload for installed bundles
   * that still read it without a guard. See `TOP_DANGER`.
   */
  dangerMen: PlayerForm[]
  /** ⚠ Stated so the card can say what it looked at. */
  qualified: number
  consideredPlayers: number
}

/**
 * Reduce a season of player lines to the handful of names worth a card.
 *
 * @param rows    every `match_player_stats` line for the clubs in question.
 * @param goals   every scoring event for those clubs. Kept separate because the
 *                two tables disagree and only one of them is authoritative here.
 */
export function scoutSide(
  rows: PlayerStatRow[],
  goals: GoalEventRow[],
  clubId: string,
): SideScout {
  const mine = rows.filter((r) => r.clubId === clubId)

  type Acc = {
    id: number
    name: string
    position: 'G' | 'D' | 'M' | 'F' | null
    appearances: number
    minutes: number
    ratingSum: number
    ratedApps: number
    assists: number
    keyPasses: number
  }
  const byPlayer = new Map<number, Acc>()

  for (const r of mine) {
    // ⚠⚠ `minutes > 0`, NEVER `is_starter`. See the header.
    if (!r.minutes || r.minutes <= 0) continue

    let a = byPlayer.get(r.externalPlayerId)
    if (!a) {
      a = {
        id: r.externalPlayerId,
        name: r.playerName,
        position: r.position,
        appearances: 0,
        minutes: 0,
        ratingSum: 0,
        ratedApps: 0,
        assists: 0,
        keyPasses: 0,
      }
      byPlayer.set(r.externalPlayerId, a)
    }

    a.appearances++
    a.minutes += r.minutes
    a.assists += r.assists ?? 0
    a.keyPasses += r.keyPasses ?? 0

    // ⚠ A NULL RATING IS EXCLUDED FROM BOTH SIDES OF THE MEAN, not counted as
    // zero. `ratedApps` is its own denominator for exactly that reason.
    if (r.rating !== null) {
      a.ratingSum += r.rating
      a.ratedApps++
    }
  }

  // ---- goals, from the authoritative source --------------------------------
  //
  // ⚠⚠ KEYED THROUGH `playerNameKey`, NOT ON THE RAW NAME. The two endpoints
  // spell one player two ways and an exact match found 10% of goals. See the
  // file header.
  const goalsByName = new Map<string, number>()
  for (const g of goals) {
    if (g.clubId !== clubId) continue
    // ⚠⚠ AN OWN GOAL IS CREDITED TO THE SIDE THAT BENEFITS AND TO NOBODY'S
    // TALLY. The feed puts the scorer's name on it and that man plays for the
    // OTHER club; counting it here would hand a defender a goal for the team he
    // plays against. `match_events` carries the same warning at the schema.
    if (g.kind === 'own_goal') continue
    if (!g.playerName) continue
    const key = playerNameKey(g.playerName)
    if (key === '') continue
    goalsByName.set(key, (goalsByName.get(key) ?? 0) + 1)
  }

  const all: PlayerForm[] = [...byPlayer.values()].map((a) => ({
    externalPlayerId: a.id,
    name: a.name,
    position: a.position,
    appearances: a.appearances,
    minutes: a.minutes,
    // Rounded to two places the way the provider sends them; a mean of 7.605
    // displayed as 7.6 beside another at 7.604 would look like a tie.
    rating: a.ratedApps === 0 ? 0 : Math.round((a.ratingSum / a.ratedApps) * 100) / 100,
    goals: goalsByName.get(playerNameKey(a.name)) ?? 0,
    assists: a.assists,
    keyPasses: a.keyPasses,
  }))

  const qualified = all.filter((p) => p.minutes >= MIN_MINUTES && p.rating > 0)

  const inForm = [...qualified]
    .sort((a, b) => b.rating - a.rating || b.minutes - a.minutes)
    .slice(0, TOP_IN_FORM)

  // ⚠ THE DANGER MAN IS NOT MINUTES-QUALIFIED, DELIBERATELY. A striker with four
  // goals in three starts is exactly who a card about danger should name, and
  // the minutes floor exists to stop a cameo winning an AVERAGE — a total is not
  // an average and cannot be inflated the same way.
  const dangerMen = [...all]
    .filter((p) => p.goals + p.assists > 0)
    .sort(
      (a, b) =>
        b.goals + b.assists - (a.goals + a.assists) ||
        b.goals - a.goals ||
        b.minutes - a.minutes,
    )
    .slice(0, TOP_DANGER)

  return {
    clubId,
    inForm,
    dangerMen,
    qualified: qualified.length,
    consideredPlayers: all.length,
  }
}
