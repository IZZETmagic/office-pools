-- =============================================================
-- 136 — THE WALKOUT IS WATCHED ONCE
-- =============================================================
-- ⚠ ADDITIVE ONLY. One nullable column and one backfill; no function is
-- replaced, so there is no `md5(prosrc)` pre-check to run.
-- =============================================================
--
-- The twin of 122, for the other end of the duel. 122 remembers that you have
-- been shown how your duel FINISHED; this remembers that you have been shown
-- who you are playing.
--
-- Ryan, 2026-09-06, planning the six Showdown phases on React Native: the
-- walkout is phase 2 and it is the moment the mode is built around. It has to
-- fire once, for the right duel, on whichever device you happen to open.
--
-- ## ⚠ WHY THIS COLUMN HAD TO EXIST BEFORE THE PHONE COULD HAVE A WALKOUT
--
-- The web has kept this marker in `localStorage` since the ceremony shipped —
-- see `hasSeenReveal` in `app/pools/[pool_id]/DuelsTab.tsx`, whose own note
-- calls it "a defensible v1" and names the durable home as "a column beside
-- `last_recap_seen_at`". This is that column.
--
-- It was defensible on the web and is not portable to React Native:
--
--   · there is no `localStorage` on a phone, and the nearest equivalent
--     (`expo-secure-store`) is still per-INSTALL — reinstall and it replays;
--   · phase 6 loops the member straight back round to a new sealed week, so a
--     per-device marker means somebody who reads on a phone and a laptop can be
--     walked out against the same opponent twice in one week.
--
-- ## ⚠⚠ A DUEL ID, NOT A TIMESTAMP — AND THIS IS WHERE IT PARTS FROM 122
--
-- The first draft of this migration mirrored 122 exactly: a `timestamptz`
-- compared against `league_duel_reveals_at`. That is wrong here, and the reason
-- is the REDRAW.
--
-- `league_generate_duel_schedule` (083, as amended by 095/117/118) redraws by
--
--     DELETE FROM league_duels WHERE pool_id = ... AND settled_at IS NULL;
--     INSERT INTO league_duels ...
--
-- — so a redraw MINTS A NEW `duel_id` for an already-revealed week. Meanwhile
-- `league_duel_reveals_at` is derived from the matchweek's own `lock_at` and
-- the previous week's `ranks_snapshot_at` (129), neither of which a redraw
-- touches. So under a timestamp marker a member would be handed a DIFFERENT
-- OPPONENT for the same matchweek with no ceremony and no signal at all — the
-- clock says they have already seen this week's reveal, and in a sense they
-- have; it just is not true any more.
--
-- Comparing the duel id cannot have that bug. A new row is a new id is a new
-- walkout, which is exactly right: the thing being revealed has changed.
--
-- ⚠ 122'S WARNING STILL APPLIES AND IS NOT VIOLATED. What 122 forbids is a
-- HIGH-WATER MARK over a value that does not advance monotonically — a
-- `last_recap_seen_matchweek int` tested with `>=`, which breaks because rounds
-- are played out of numerical order (101 measured a minimum gap of minus 121
-- days). This is an EQUALITY test against an opaque id, so it has no ordering
-- to get wrong. There is exactly one current duel at a time (119 opens them one
-- at a time), so one slot is all it needs.
--
-- ⚠ AND IT IS NOT `matchweek_number` EITHER. That would be 122's bug precisely.
--
-- ## Per ENTRY, not per member
--
-- As 122. A multi-entry pool draws each entry its own opponent, so each entry
-- gets its own walkout and its own marker.
--
-- ## Why the column can be written from the client
--
-- Same grant path 122 verified, and this column inherits it:
--   · `pg_class.relacl` = `authenticated=arwdDxtm/postgres` — a TABLE-WIDE
--     grant, so a new column needs no further GRANT.
--   · RLS policy `"Users can update own entries"` lets a member write their own
--     row while the pool is not archived (`member_pool_writable`).
--
-- ⚠ THAT GRANT IS WIDER THAN THIS FEATURE NEEDS and a separate audit is open on
-- it. If it is ever narrowed to column-level grants, `last_reveal_seen_duel`
-- MUST be on the list alongside `last_recap_seen_at` — otherwise the walkout
-- stops marking itself watched and replays on every single visit, which is the
-- most irritating possible failure of this feature.
--
-- ⚠ NO FOREIGN KEY TO `league_duels`, DELIBERATELY. The redraw deletes rows,
-- and `ON DELETE CASCADE` would take the member's entry with it while
-- `ON DELETE SET NULL` would silently re-arm the walkout for everybody in the
-- pool every time an admin redraws. A dangling id here is harmless: it can only
-- ever fail to equal the current duel, which shows the ceremony — the safe
-- direction.

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS last_reveal_seen_duel uuid;

COMMENT ON COLUMN public.pool_entries.last_reveal_seen_duel IS
  'The league_duels.duel_id whose walkout this entry last watched (or skipped). '
  'There is an unseen walkout when the entry''s current duel_id differs from '
  'this, or this is NULL. A DUEL ID, not a timestamp and not a matchweek '
  'number: a redraw DELETEs and re-INSERTs (083/095/117), minting a new id for '
  'the same matchweek, so an id comparison re-reveals a changed opponent while '
  'a clock comparison would not. Equality, so 122''s out-of-order-rounds '
  'warning does not apply. Intentionally NOT a foreign key — see migration 136. '
  'Written by the client on CLOSE, however it is closed, so nobody is trapped '
  'behind an animation that will not render. Twin of last_recap_seen_at (122).';

-- -------------------------------------------------------------
-- The cold start
-- -------------------------------------------------------------
-- ⚠ WITHOUT THIS, EVERY EXISTING MEMBER IS WALKED OUT AGAINST AN OPPONENT THEY
-- HAVE KNOWN ABOUT FOR DAYS. `NULL` means "never seen", which is right for an
-- entry whose duel has not opened yet and wrong for one whose has.
--
-- ⚠ THE LATEST REVEALED DUEL IS THE CURRENT ONE, and that is not an
-- approximation: 119 opens duels ONE AT A TIME, so the most recent matchweek a
-- member is allowed to see is by construction the one they are playing. Ordered
-- by `lock_at`, never by `matchweek_number` — 101, the minus-121-day gap.
--
-- ⚠ ONLY WHERE A DUEL IS ACTUALLY REVEALED. Stamping every showdown entry
-- unconditionally would burn the walkout for a pool whose first duel has not
-- opened yet — the members most entitled to see it. 116's RLS does not filter
-- this statement (it runs as the migration), so the reveal instant has to be
-- asked for explicitly rather than inferred from a row being present.
--
-- Blast radius at the time of writing: migration 128 verified live that exactly
-- two pools carry `league_mode = 'showdown'` and both are the seeded UX pools.
-- No member-facing pool is affected. Re-run that check before assuming it holds.

UPDATE public.pool_entries pe
   SET last_reveal_seen_duel = (
     SELECT d.duel_id
       FROM league_duels d
       JOIN pools p2 ON p2.pool_id = d.pool_id
       JOIN league_matchweeks m
         ON m.season_id = p2.league_season_id
        AND m.matchweek_number = d.matchweek_number
      WHERE d.pool_id = p.pool_id
        AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
        AND league_duel_reveals_at(d.pool_id, d.matchweek_number) <= now()
      ORDER BY m.lock_at DESC, d.matchweek_number DESC
      LIMIT 1
   )
  FROM pool_members pm
  JOIN pools p ON p.pool_id = pm.pool_id
 WHERE pe.member_id = pm.member_id
   AND p.league_mode = 'showdown'
   AND pe.last_reveal_seen_duel IS NULL;

-- =============================================================
-- VERIFY
-- =============================================================
--   -- 1. The column exists and is nullable.
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'pool_entries'
--      AND column_name = 'last_reveal_seen_duel';
--   -- expect: last_reveal_seen_duel | uuid | YES
--
--   -- 2. Nothing outside showdown was touched, and every stamped entry points
--   --    at a duel it is genuinely IN.
--   SELECT p.league_mode,
--          count(*)                              AS entries,
--          count(pe.last_reveal_seen_duel)        AS stamped,
--          count(*) FILTER (
--            WHERE pe.last_reveal_seen_duel IS NOT NULL
--              AND NOT EXISTS (
--                SELECT 1 FROM league_duels d
--                 WHERE d.duel_id = pe.last_reveal_seen_duel
--                   AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
--              )
--          )                                      AS wrong_duel
--     FROM pool_entries pe
--     JOIN pool_members pm ON pm.member_id = pe.member_id
--     JOIN pools p         ON p.pool_id    = pm.pool_id
--    GROUP BY p.league_mode;
--   -- expect: stamped > 0 ONLY on 'showdown', and wrong_duel = 0 everywhere.
--
--   -- 3. Nobody was stamped with a duel that has not revealed yet.
--   SELECT count(*) AS stamped_but_sealed
--     FROM pool_entries pe
--     JOIN league_duels d ON d.duel_id = pe.last_reveal_seen_duel
--    WHERE league_duel_reveals_at(d.pool_id, d.matchweek_number) > now();
--   -- expect: 0
