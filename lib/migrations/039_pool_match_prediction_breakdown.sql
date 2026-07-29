-- 039: extend the per-match aggregate to everything the Form tab's crowd
--      section needs, so it stops pulling every prediction in the pool.
--
-- WHY
-- Form (web AnalyticsTab, and /entries/:id/analytics which mobile calls) pages
-- EVERY prediction in the pool on every open — 13,385 rows on the largest — to
-- produce per-match crowd percentages. The mobile route is per-viewer and
-- uncached, which makes it the heaviest remaining read in the product.
--
-- Everything it needs is an aggregate over those rows. 038 already returned
-- total + correct for Matchday Pulse; this adds the outcome split and the modal
-- scoreline, so ONE function serves both callers.
--
-- ⚠ TWO CALLERS, TWO POPULATIONS — hence p_submitted_only:
--   * Matchday Pulse (Banter sidebar) counts EVERY prediction, submitted or not.
--     That is what the client did before 038 and the numbers are already on
--     screen, so it stays the default.
--   * Crowd consensus (Form) counts only entries with has_submitted_predictions,
--     matching computeCrowdConsensus in analyticsHelpers.ts — an unsubmitted
--     draft must not sway "73% of the pool picked Argentina".
-- Getting this wrong in either direction silently moves a number a member has
-- already seen, which is why it is a parameter rather than a judgement call
-- baked into the function.
--
-- TIE-BREAK, deliberately different from the JS:
-- computeCrowdConsensus picks the top scoreline by "first one seen with a higher
-- count", so a tie resolves by Map insertion order — effectively arbitrary and
-- not reproducible. This orders by count DESC, then home ASC, then away ASC:
-- deterministic. On a tie the two can disagree about WHICH equally-popular
-- scoreline is shown; the percentage is identical either way.
--
-- Replaces the 038 signature (adds columns), so it must DROP first — CREATE OR
-- REPLACE cannot change a return type. DDL is transactional, so callers see
-- either the old function or the new one, never neither. Existing callers pass
-- only p_pool_id and read match_id/total/correct; both still work.

DROP FUNCTION IF EXISTS public.pool_match_prediction_accuracy(uuid);

CREATE OR REPLACE FUNCTION public.pool_match_prediction_accuracy(
  p_pool_id uuid,
  p_submitted_only boolean DEFAULT false
)
RETURNS TABLE (
  match_id uuid,
  total integer,
  correct integer,
  home_count integer,
  draw_count integer,
  away_count integer,
  top_score_home integer,
  top_score_away integer,
  top_score_count integer
)
LANGUAGE sql
STABLE
AS $$
  WITH preds AS (
    SELECT p.match_id,
           p.predicted_home_score AS h,
           p.predicted_away_score AS a,
           m.home_score_ft        AS mh,
           m.away_score_ft        AS ma
    FROM predictions p
    JOIN pool_entries pe ON pe.entry_id = p.entry_id
    JOIN pool_members pm ON pm.member_id = pe.member_id
    JOIN matches m       ON m.match_id   = p.match_id
    WHERE pm.pool_id = p_pool_id
      AND m.is_completed
      AND m.home_score_ft IS NOT NULL
      AND m.away_score_ft IS NOT NULL
      AND p.predicted_home_score IS NOT NULL
      AND p.predicted_away_score IS NOT NULL
      AND (NOT p_submitted_only OR pe.has_submitted_predictions)
  ),
  agg AS (
    SELECT pr.match_id,
           count(*)::int                                        AS total,
           -- Winner-vs-winner on FULL-TIME scores, penalties ignored: a match won
           -- on penalties counts as the draw it was after 120 minutes. Matches the
           -- client's getWinner(); preserved, not "fixed".
           count(*) FILTER (WHERE sign(pr.h - pr.a) = sign(pr.mh - pr.ma))::int AS correct,
           count(*) FILTER (WHERE pr.h > pr.a)::int              AS home_count,
           count(*) FILTER (WHERE pr.h = pr.a)::int              AS draw_count,
           count(*) FILTER (WHERE pr.h < pr.a)::int              AS away_count
    FROM preds pr
    GROUP BY pr.match_id
  ),
  top AS (
    SELECT DISTINCT ON (t.match_id) t.match_id, t.h, t.a, t.c
    FROM (
      SELECT pr.match_id, pr.h, pr.a, count(*)::int AS c
      FROM preds pr
      GROUP BY pr.match_id, pr.h, pr.a
    ) t
    ORDER BY t.match_id, t.c DESC, t.h ASC, t.a ASC
  )
  SELECT agg.match_id, agg.total, agg.correct,
         agg.home_count, agg.draw_count, agg.away_count,
         top.h, top.a, top.c
  FROM agg
  JOIN top ON top.match_id = agg.match_id;
$$;

REVOKE ALL ON FUNCTION public.pool_match_prediction_accuracy(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pool_match_prediction_accuracy(uuid, boolean) TO service_role;
