-- =============================================================
-- 130 — THE MATCHWEEK TOTAL IS COUNTED IN SQL
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function; nothing is replaced, so there is no
-- `md5(prosrc)` pre-check to run.
--
-- ✅ APPLIED TO PRODUCTION 2026-09-02 (ujthamlehjyubbzxbnes), ahead of the code
-- that names it — which was the whole ordering constraint, and it is discharged.
--
-- ## What was checked, because applying is not verifying
--
-- It was written with no database access and no local Postgres (only `libpq`),
-- so none of the care in these comments was evidence it ran. These are:
--
--   * a matchweek WITH scores — 9 entries, **0 mismatches** against a plain
--     GROUP BY over the same rows
--   * the EMPTY matchweek — returns `{"totals":{},"per_fixture":{}}`, NOT null,
--     which is the COALESCE below doing its job. This is the normal state of
--     every matchweek until the first goal, so it is the case that mattered
--   * a pool id that does not exist — same, no error
--   * the per-fixture inner map byte-identical to `jsonb_object_agg` over the
--     rows, with **zeros preserved** (a wrong pick scores 0 and must render 0,
--     not vanish)
--   * grants — `authenticated` false, `anon` false, `service_role` true
--
-- ⚠ THE ORDERING MATTERED AND STILL DOES IF THIS IS EVER REBUILT.
-- `readMatchweekPoints` calls this function from `6aa2831` onward, so a deploy
-- landing ahead of the migration fails every call with "function does not
-- exist" — on the pool page, the duel recap and /api/pools/[id]/duel-live. All
-- three log it, but what a member SEES is a duel card reading 0 - 0 and a recap
-- of a duel that never happened. Same shape as migration 026, where code
-- shipped ahead of the column and PostgREST rejected every upsert for seven
-- hours in silence (R14).
--
-- `LANGUAGE sql` is what made the check cheap: unlike `plpgsql` — where names
-- resolve at RUN time and a clean apply proves nothing, the 081->082 lesson —
-- a SQL body is parsed and its columns resolved at CREATE time, so
-- `CREATE OR REPLACE` succeeding is itself most of the verification.
-- =============================================================
--
-- `readMatchweekPoints` (lib/league/duels.ts) pulled every `league_match_scores`
-- row for one matchweek to the server and summed them in a `for` loop. The
-- read-path review of 2026-08-31 named it, and named why it stings:
--
--   > We wrote the rule down in one migration and broke it in the file next
--   > door.
--
-- The migration it means is **124**, whose own header says *"the scoring
-- architecture rule settled this on 2026-07-29: aggregates belong in SQL."*
--
-- ## What was actually wrong, which is not only the loop
--
-- The row count is entries x fixtures — 100 for a ten-person Premier League
-- pool, 400 for forty, and **1,000 at a hundred members**, which is PostgREST's
-- cap. Over it the read does not error: it returns exactly 1,000 rows with
-- `error: null`, and the duel card renders a plausible, wrong scoreline. The
-- World Cup's largest pool had 192 entries.
--
-- So this is not a tidy-up. Paging the old read would have fixed the
-- truncation and still shipped 1,000 rows to compute twenty numbers.
--
-- ## ⚠ IT RETURNS THE BREAKDOWN TOO, AND THAT IS NOT A COMPROMISE
--
-- The obvious shape is "sum in SQL, fetch the rows separately for the
-- fixture-by-fixture team sheet", and that is worse than what it replaces: two
-- round trips, and the per-row half still uncapped. The team sheet genuinely
-- needs one number per entry per fixture — it draws who took which pick — so
-- the per-fixture map is real data, not an aggregate anybody can avoid.
--
-- What it does NOT need is those numbers as N rows on the wire. Shaped as one
-- jsonb object they are a single row however big the pool gets, the cap cannot
-- apply, and the caller stops doing assembly work it was only doing because
-- PostgREST handed it rows.
--
--   { "totals":      { "<entry_id>": 400, ... },
--     "per_fixture": { "<entry_id>": { "3": 100, "7": 0 }, ... } }
--
-- ⚠ JSON OBJECT KEYS ARE TEXT. `fixture_number` comes back as `"3"`, not `3`.
-- The TypeScript side converts with `Number(...)` and its test covers exactly
-- that, because a `Map<string, ...>` keyed by `"3"` looks identical in a
-- debugger to one keyed by `3` and misses every lookup.
--
-- ## ⚠ SECURITY DEFINER, because the source table is deny-all
--
-- `league_match_scores` has RLS on and zero policies (migration 050) — one of
-- the four engine tables deliberately closed to clients. A user-scoped read
-- returns zero rows and no error, which is how the duel card once showed 0 - 0
-- for a matchweek where everybody had scored.
--
-- ⚠ AND service_role ONLY, unlike 124. This returns EVERY entry's points for
-- the matchweek, which is more than any one member should be able to pull —
-- 124 is scoped to a caller's own entry plus a median, this is the whole room.
-- Its three callers are all server-side on the admin client (the pool page, the
-- duel page, /api/pools/[id]/duel-live), and the server decides what of it
-- reaches a screen. Same posture as migration 102.
--
-- ⚠ Retired and detached entries are INCLUDED, unlike 124, and that is
-- deliberate: a duel that was already drawn against somebody who has since left
-- still has to render its historic scoreline. 124 answers "what is the room
-- doing", which is a question about the present; this answers "what happened in
-- this matchweek", which is a question about the record. `league_score_duels`
-- makes the same call — it settles duels off these rows without consulting
-- `retired_at`.

CREATE OR REPLACE FUNCTION public.league_matchweek_points(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH scored AS (
    SELECT s.entry_id, s.fixture_number, s.total_points
      FROM league_match_scores s
     WHERE s.pool_id = p_pool_id
       AND s.matchweek_number = p_matchweek_number
  ),
  per_entry AS (
    SELECT r.entry_id,
           SUM(r.total_points)::int AS pts,
           -- One object per entry: fixture_number -> points for that fixture.
           jsonb_object_agg(r.fixture_number::text, r.total_points) AS by_fixture
      FROM scored r
     GROUP BY r.entry_id
  )
  SELECT jsonb_build_object(
    -- ⚠ COALESCE on both halves. A matchweek nobody has scored yet is the
    -- normal state all weekend, and `jsonb_object_agg` over zero rows is NULL,
    -- not `{}`. Returning NULL here would make the caller's `?? {}` the thing
    -- standing between a live duel card and a crash.
    'totals',      COALESCE((SELECT jsonb_object_agg(p.entry_id::text, p.pts)        FROM per_entry p), '{}'::jsonb),
    'per_fixture', COALESCE((SELECT jsonb_object_agg(p.entry_id::text, p.by_fixture) FROM per_entry p), '{}'::jsonb)
  );
$fn$;

COMMENT ON FUNCTION public.league_matchweek_points(uuid, integer) IS
  'One matchweek''s league_match_scores, aggregated: {totals: {entry_id: pts}, '
  'per_fixture: {entry_id: {fixture_number: pts}}}. Replaces a server-side for '
  'loop over the raw rows (lib/league/duels.ts) that was entries x fixtures — '
  '1,000 rows at 100 members, which is the PostgREST cap, and over it the read '
  'returns 1,000 rows with error null and the duel card renders a wrong '
  'scoreline. Returns ONE row however big the pool. SECURITY DEFINER because '
  'league_match_scores is deny-all (050); service_role only because this is '
  'every entry''s points, not the caller''s own — unlike league_matchweek_series '
  '(124). Retired and detached entries are INCLUDED: a settled duel against '
  'somebody who has left still has to render. Migration 130.';

-- Engine-adjacent, so it follows migration 102: no signed-in user holds EXECUTE.
REVOKE EXECUTE ON FUNCTION public.league_matchweek_points(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.league_matchweek_points(uuid, integer) TO service_role;
