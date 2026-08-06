-- 042 — one base for match points; round multipliers do the knockout scaling.
--
-- Until now a knockout match was scaled twice: once by the ratio between
-- knockout_* and group_* base points, and again by the round multiplier. The
-- engine (lib/scoring/core.ts) now reads only the group_* columns, so this
-- migration folds that ratio into the multipliers to keep every pool scoring
-- the same.
--
--     new_multiplier = old_multiplier * (knockout_exact_score / group_exact_score)
--
-- Verified against production with scripts/verify-unified-base.ts before
-- applying: 606 of 623 pools come out bit-identical across every stage and
-- tier. The other 17 cannot be preserved and are listed at the bottom — their
-- knockout:group ratio differs per tier, and one multiplier cannot reproduce
-- three different ratios. The exact-score ratio is used for them, so the most
-- common scoring event stays right and the other two tiers move.
--
-- No stored points change. match_scores and bonus_scores are written by a
-- recalculation, and every affected pool is `completed`, so nothing recomputes
-- unless someone deliberately re-runs it.
--
-- The knockout_* columns are LEFT IN PLACE and simply stop being read. Dropping
-- them is a separate step once this has sat in production for a while — they
-- are the only record of what a pool's scoring used to be, and the rollback at
-- the bottom needs them.

begin;

-- Five of the six multipliers are numeric(3,1) — max 99.9. The uniform pools
-- top out at 16.0 and fit, but one outlier needs 106.67, and an admin can
-- always create a wider ratio later. Widen once rather than clamp.
alter table pool_settings
  alter column round_16_multiplier      type numeric(6,2),
  alter column quarter_final_multiplier type numeric(6,2),
  alter column semi_final_multiplier    type numeric(6,2),
  alter column third_place_multiplier   type numeric(6,2),
  alter column final_multiplier         type numeric(6,2),
  alter column round_32_multiplier      type numeric(6,2);

-- Keep the pre-migration multipliers so the rollback is exact rather than
-- reconstructed. Dropped together with the knockout_* columns later.
create table if not exists pool_settings_premigration_042 as
  select pool_id,
         round_32_multiplier, round_16_multiplier, quarter_final_multiplier,
         semi_final_multiplier, third_place_multiplier, final_multiplier
  from pool_settings;

update pool_settings s
set round_32_multiplier      = round(s.round_32_multiplier      * r.ratio, 2),
    round_16_multiplier      = round(s.round_16_multiplier      * r.ratio, 2),
    quarter_final_multiplier = round(s.quarter_final_multiplier * r.ratio, 2),
    semi_final_multiplier    = round(s.semi_final_multiplier    * r.ratio, 2),
    third_place_multiplier   = round(s.third_place_multiplier   * r.ratio, 2),
    final_multiplier         = round(s.final_multiplier         * r.ratio, 2)
from (
  select pool_id,
         knockout_exact_score::numeric / nullif(group_exact_score, 0) as ratio
  from pool_settings
) r
where r.pool_id = s.pool_id
  and r.ratio is not null
  -- A ratio of 1 is already a no-op; skipping it keeps the diff honest about
  -- which rows this touched.
  and r.ratio <> 1;

commit;

-- ---------------------------------------------------------------------------
-- The 17 pools whose scoring moves. Their knockout:group ratio differs per
-- tier, so no single multiplier reproduces it. Listed here rather than left to
-- be rediscovered:
--
--   Mundial 2026                 40 entries  30/15/10 -> 5/5/5    ratios .17/.33/.50
--   PPMD WC 2026                 37 entries  5/5/5    -> 15/10/5  ratios 3/2/1
--   Hareket MEA Team             35 entries  25/15/10 -> 50/30/15 ratios 2/2/1.5
--   Stroom Pronostiek            17 entries  100/85/55 -> 175/110/90
--   R&V FIFA World Cup 2026      11 entries  100/95/90 -> 200/175/150
--   Fase 2                        9 entries  5/5/5    -> 30/20/10
--   World Cup 2026 !              4 entries  100/70/40 -> 150/100/60
--   …and nine more with 3 entries or fewer.
--
-- All are `completed`, so their stored points are final and unaffected. The
-- difference only appears if one is deliberately recalculated.
-- ---------------------------------------------------------------------------

-- Rollback
-- --------
-- begin;
-- update pool_settings s
-- set round_32_multiplier      = p.round_32_multiplier,
--     round_16_multiplier      = p.round_16_multiplier,
--     quarter_final_multiplier = p.quarter_final_multiplier,
--     semi_final_multiplier    = p.semi_final_multiplier,
--     third_place_multiplier   = p.third_place_multiplier,
--     final_multiplier         = p.final_multiplier
-- from pool_settings_premigration_042 p
-- where p.pool_id = s.pool_id;
-- commit;
-- …then revert lib/scoring/core.ts to read the knockout_* columns again.
