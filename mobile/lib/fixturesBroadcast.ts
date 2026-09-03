// =============================================================
// THE LIVE HALF, ARRIVING
// =============================================================
// Migration 125 sends live fixture state — score, status, the ticking minute —
// as a `fixtures_update` event on `pool:{id}:leaderboard`, every time the sync
// writes something that genuinely moved. It has been running in production
// since 2026-08-31.
//
// ⚠ NOTHING ON THE PHONE WAS LISTENING TO IT. That is the defect this module
// closes, and it was not a missing feature so much as a missing ear:
//
//   Home     read the merged match list but refreshed only `useHomeData`, so
//            it rendered a pre-kickoff snapshot — "next kickoff" and "upcoming"
//            for a game that had already started, and no Live Now card at all.
//   Results  refreshed the match feed on pull and on focus, which is the ONLY
//            reason it looked right. Standing still, it went stale too.
//
// The World Cup never had this problem: a match going live wrote a `matches`
// row and the `postgres_changes` channel in `useTournamentMatches` pushed it
// to every open screen. A league fixture is not in `matches` and never will be,
// so the league needs its own ear, and this is the half of it that can be
// tested — `mobile/` has no test runner, but the root `vitest.config.ts` picks
// up `mobile/**/__tests__/**` for any module that imports nothing from React
// Native. Hence: no imports, and the subscription itself stays in the hook.
//
// ⚠ IT REWRITES THE CACHED RESPONSE, NOT A SECOND COPY OF THE TRUTH. The first
// shape this took was an overlay of live values merged on top of the fetched
// list, which is wrong in a way that only shows up after a backgrounded phone:
// a refetch that returns FULL TIME would be shadowed by an overlay still
// holding 78', and the match would wind backwards. One source, rewritten in
// place, cannot do that — a refetch simply replaces it.
// =============================================================

/**
 * One fixture inside a `fixtures_update` message.
 *
 * ⚠ THE KEYS ARE THE DATABASE'S, NOT OURS — migration 125 builds this object in
 * SQL, and its comment says the keys match the client's fixture shape "exactly,
 * so a message can be spread over a fixture with no translation layer". That is
 * true of the WEB's league client. It is NOT true here: the phone holds these
 * rows in the World Cup MATCH shape, which the fixtures route maps them into,
 * so this module is that translation layer. Renaming a key on either side
 * silently stops updates rather than failing.
 */
export type FixtureUpdate = {
  /** `league_fixtures.fixture_number` — unique within a season. The join key. */
  number: number;
  /** The matchweek, carried so a client watching one week can drop another's. */
  matchweek: number;
  status: string;
  isCompleted: boolean;
  homeScore: number | null;
  awayScore: number | null;
  liveMinute: number | null;
  livePeriod: string | null;
  liveAdded: number | null;
};

export type FixturesUpdateMessage = {
  season_id: string;
  fixtures: FixtureUpdate[];
};

/**
 * Just enough of the fixtures response to rewrite a row in place.
 *
 * Structural rather than imported: `useTournamentMatches` reaches React Native
 * through `./supabase`, and importing it here would put this module out of the
 * root test runner's reach — which is the one thing the file header asks for.
 */
export type SeasonFixtures = {
  season_id: string;
  matches: Record<string, unknown>[];
};

/** True when the message names a fixture this payload does not hold. */
const isEmpty = (msg: FixturesUpdateMessage) =>
  !msg || !Array.isArray(msg.fixtures) || msg.fixtures.length === 0;

/**
 * Apply one `fixtures_update` to the cached `/api/users/:id/fixtures` payload.
 *
 * Returns `prev` UNCHANGED — the same object identity — when there is nothing
 * to do, so a message about a season the viewer no longer holds, or one that
 * repeats what is already on screen, costs no render. React Query stores what
 * comes back, so a new object here is a re-render of every match list in the
 * app; that is worth spending on a goal and not on a heartbeat.
 *
 * ⚠ `status_detail` IS NOT IN THE MESSAGE, and this is the one thing the push
 * cannot keep current. The trigger COMPARES it — a postponement fires a message
 * — but the payload does not carry it, so a fixture that goes `postponed` here
 * gets the new status against a stale detail until the next fetch. That is at
 * most the 30 s staleTime, and it matters because `getMatchStatusBadge` reads
 * exactly those two fields together. Adding it to 125's `jsonb_build_object` is
 * the honest fix if it ever shows.
 */
export function applyFixturesUpdate<T extends { seasons: SeasonFixtures[] }>(
  prev: T | undefined,
  msg: FixturesUpdateMessage,
): T | undefined {
  if (!prev || isEmpty(msg)) return prev;

  const byNumber = new Map(msg.fixtures.map((f) => [f.number, f]));
  let seasonChanged = false;

  const seasons = prev.seasons.map((season) => {
    // ⚠ SCOPED TO THE SEASON THE MESSAGE NAMES. A fixture number is unique
    // within a season and nowhere else — every season has a fixture 1 — so
    // matching without this would write La Liga's score onto a Ligue 1 game
    // for any member holding both. The subscription is per-season too, but
    // that guards the topic, not the payload, and a pool can be moved between
    // seasons while a socket is open.
    if (season.season_id !== msg.season_id) return season;

    let matchChanged = false;
    const matches = season.matches.map((row) => {
      const update = byNumber.get(row.match_number as number);
      if (!update) return row;

      const next = {
        ...row,
        status: update.status,
        is_completed: update.isCompleted,
        home_score_ft: update.homeScore,
        away_score_ft: update.awayScore,
        live_minute: update.liveMinute,
        live_period: update.livePeriod,
        live_added: update.liveAdded,
      };
      // A message can repeat what we already hold — the sync re-sends on any
      // of the eight compared columns moving, and a client that has just
      // fetched is already there.
      if (
        row.status === next.status &&
        row.is_completed === next.is_completed &&
        row.home_score_ft === next.home_score_ft &&
        row.away_score_ft === next.away_score_ft &&
        row.live_minute === next.live_minute &&
        row.live_period === next.live_period &&
        row.live_added === next.live_added
      ) {
        return row;
      }
      matchChanged = true;
      return next;
    });

    if (!matchChanged) return season;
    seasonChanged = true;
    return { ...season, matches };
  });

  if (!seasonChanged) return prev;
  return { ...prev, seasons } as T;
}
