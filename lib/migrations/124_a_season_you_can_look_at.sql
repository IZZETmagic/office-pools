-- =============================================================
-- 124 — A SEASON YOU CAN LOOK AT
-- =============================================================
-- ⚠ ADDITIVE ONLY. One new function; nothing is replaced, so there is no
-- `md5(prosrc)` pre-check to run.
-- =============================================================
--
-- The wait between duels needed something to look at, and a member's week is
-- only interesting NEXT TO the pool's week — 400 means nothing until you know
-- the room scored 300. So: one row per matchweek, your points and the pool's
-- median, ready to draw.
--
-- ## ⚠ AGGREGATED IN SQL, DELIBERATELY
--
-- The alternative is pulling `league_match_scores` to the server and summing
-- there, and for a 10-member season that is 10 entries x 38 weeks x 10
-- fixtures = **3,800 rows** — over the PostgREST 1,000 cap, so it would need
-- paging, and it would ship 3,800 rows to compute 38. The scoring architecture
-- rule settled this on 2026-07-29: aggregates belong in SQL. This returns at
-- most 38 rows however big the pool gets.
--
-- ## ⚠ SECURITY DEFINER, because the source table is deny-all
--
-- `league_match_scores` has RLS on and zero policies (migration 050) — it is an
-- engine table and no member may read it. A member CAN be told what they
-- scored and what the room scored, which is what this returns: two numbers per
-- matchweek, never another member's row. That is the whole reason it is a
-- function and not a view.
--
-- ## The median, not the mean
--
-- One member who forgets to pick scores 0 and drags a mean down far enough to
-- flatter everybody else. A median is what "the room" actually did.
--
-- ⚠ Retired and detached entries are excluded, matching `league_finalize_ranks`
-- (057). Somebody who left the pool in October is not part of November's room.

CREATE OR REPLACE FUNCTION public.league_matchweek_series(
  p_pool_id  uuid,
  p_entry_id uuid
)
RETURNS TABLE (
  matchweek_number integer,
  your_points      integer,
  median_points    integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH per_entry AS (
    -- One row per entry per matchweek: what that entry scored that week.
    SELECT s.matchweek_number, s.entry_id, SUM(s.total_points)::int AS pts
      FROM league_match_scores s
      JOIN pool_entries pe ON pe.entry_id = s.entry_id
     WHERE s.pool_id = p_pool_id
       AND pe.member_id IS NOT NULL   -- detached: left or was removed
       AND pe.retired_at IS NULL      -- retired: stopped participating
     GROUP BY s.matchweek_number, s.entry_id
  )
  SELECT p.matchweek_number,
         -- ⚠ COALESCE, not a filter: a matchweek the viewer did not pick in
         -- still belongs on the chart as a zero. Dropping the row would close
         -- the gap and draw a season they did not play.
         COALESCE(MAX(p.pts) FILTER (WHERE p.entry_id = p_entry_id), 0)::int,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY p.pts)::int
    FROM per_entry p
   GROUP BY p.matchweek_number
   ORDER BY p.matchweek_number;
$fn$;

COMMENT ON FUNCTION public.league_matchweek_series(uuid, uuid) IS
  'One row per matchweek for a chart: what this entry scored, and the pool''s '
  'MEDIAN that week. SECURITY DEFINER because league_match_scores is deny-all '
  '(050) — a member may be told what they scored and what the room scored, '
  'never another member''s row. Aggregated in SQL rather than on the server '
  'because the raw table is ~3,800 rows for a 10-member season, over the '
  'PostgREST cap, to compute 38. Median not mean: one member who forgets to '
  'pick would drag a mean down and flatter everybody. Retired and detached '
  'entries excluded, matching league_finalize_ranks (057). Migration 124.';
