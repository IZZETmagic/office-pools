-- =============================================================
-- 079 — LEAGUE POOL SETTINGS — the prices, where a pool can move them
-- =============================================================
-- Decision 10 settles the Table mode values and then says the important part:
-- "All values are `league_pool_settings` columns and remain movable." This is
-- that table.
--
-- ## Scope, said plainly
--
-- L-D describes this table as eventually holding the flat fixture prices and
-- the Results price too, with `league_score_fixture` preferring it and falling
-- back to `pool_settings.group_*`. **That half is NOT built here.** Moving the
-- fixture prices means re-opening the fixture engine, which is a different
-- change with a different blast radius, and Table mode does not need it. It
-- remains the unfinished half of L-D.
--
-- So: Table columns only, and the comment on the table says so, rather than
-- leaving a future reader to infer why the fixture prices are somewhere else.
--
-- ## No row is the normal case
--
-- The engine COALESCEs every value against the shipped default, so a pool with
-- no row here scores exactly as designed. A row appears only once a pool has
-- actually moved a number. That keeps 623 World Cup pools and every default
-- league pool out of the table entirely.
--
-- ## Why the band sizes are columns
--
-- `table_top_n` and `table_relegation_n` are not in the plan — they are 4 and 3
-- for the Premier League and were going to be literals in the engine. A
-- competition with five Champions League places (England had five in 2023/24,
-- on coefficient) or a relegation playoff would then need an engine change to
-- score correctly. As columns it is a number, not a deployment.
-- =============================================================

CREATE TABLE IF NOT EXISTS league_pool_settings (
  pool_id                      uuid PRIMARY KEY REFERENCES pools(pool_id) ON DELETE CASCADE,
  table_exact_points           integer NOT NULL DEFAULT 100,
  table_step_penalty           integer NOT NULL DEFAULT 20,
  table_champion_bonus         integer NOT NULL DEFAULT 500,
  table_top_four_bonus         integer NOT NULL DEFAULT 100,
  table_relegation_bonus       integer NOT NULL DEFAULT 100,
  table_perfect_top_four_bonus integer NOT NULL DEFAULT 250,
  table_top_n                  integer NOT NULL DEFAULT 4,
  table_relegation_n           integer NOT NULL DEFAULT 3,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lps_non_negative_ck CHECK (
    table_exact_points >= 0 AND table_step_penalty >= 0
    AND table_champion_bonus >= 0 AND table_top_four_bonus >= 0
    AND table_relegation_bonus >= 0 AND table_perfect_top_four_bonus >= 0
  ),
  CONSTRAINT lps_band_sizes_ck CHECK (
    table_top_n BETWEEN 0 AND 10 AND table_relegation_n BETWEEN 0 AND 10
  )
);

COMMENT ON TABLE league_pool_settings IS
  'Per-pool league prices. Today it holds Table mode values only (plan section 3.5 defaults, decision 10). The flat fixture prices and the Results price still live in pool_settings.group_* and are read by league_score_fixture — moving those here is the unfinished half of L-D, not part of Table mode.';

COMMENT ON COLUMN league_pool_settings.table_top_n IS
  'How many places count as "the top" for the set bonus. 4 for the Premier League. A column rather than a literal so a competition with five Champions League places changes a number instead of the engine.';

COMMENT ON COLUMN league_pool_settings.table_relegation_n IS
  'How many places count as relegation for the set bonus. 3 for the Premier League. Note the Table tab draws its relegation STRIPE from the feed description, which can disagree in a league with a playoff place; they coincide in the Premier League and the difference is recorded as a known v1 simplification.';

ALTER TABLE league_pool_settings ENABLE ROW LEVEL SECURITY;

-- Members read their own pool's prices — the Scoring Rules tab shows them.
DROP POLICY IF EXISTS "Members can view their pool league settings" ON league_pool_settings;
CREATE POLICY "Members can view their pool league settings"
  ON league_pool_settings FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM pool_members pm JOIN users u ON pm.user_id = u.user_id
    WHERE pm.pool_id = league_pool_settings.pool_id
      AND u.auth_user_id = (SELECT auth.uid())
  ));

-- Writing is the admin's, which is what §0.10's "Advanced" config surface will
-- drive when it is built.
DROP POLICY IF EXISTS "Pool admins can manage league settings" ON league_pool_settings;
CREATE POLICY "Pool admins can manage league settings"
  ON league_pool_settings FOR ALL
  USING (is_pool_admin(league_pool_settings.pool_id))
  WITH CHECK (is_pool_admin(league_pool_settings.pool_id));
