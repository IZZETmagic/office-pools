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
-- It was defensible on the web and is not portable to React Native, for two
-- separate reasons:
--
--   · there is no `localStorage` on a phone, and the nearest equivalent
--     (`expo-secure-store`) is still per-INSTALL — reinstall and the walkout
--     replays;
--   · phase 6 loops the member straight back round to a new sealed week, so a
--     per-device marker means a member who reads on a phone and a laptop can be
--     walked out against the same opponent twice in one week. The ceremony is
--     worth watching once. Twice is a bug that looks like a feature.
--
-- Making it durable also retires the web's compromise: both surfaces can read
-- one answer instead of each keeping their own.
--
-- ## ⚠ A TIMESTAMP, NEVER A MATCHWEEK NUMBER — 122'S REASONING APPLIES HERE
--
-- The obvious design is `last_reveal_seen_matchweek int` with a `>= n` test,
-- and it is wrong for exactly the reason 122 records: rounds are PLAYED OUT OF
-- NUMERICAL ORDER — 101 measured a minimum gap of minus 121 days across three
-- real seasons — so a member who watched the walkout for a late-numbered round
-- played early would hold a high-water mark no later round could clear, and
-- would never be shown another walkout for the rest of the season. Nothing
-- would error. The flagship moment of the flagship mode would simply stop
-- happening for that member, quietly, for months.
--
-- ## ⚠ THE ANCHOR IS THE REVEAL INSTANT, AND IT IS MONOTONIC
--
-- 122 compares against `settled_at`, which is safe because settlement time
-- moves forward whatever order the rounds are numbered in. The equivalent here
-- is `league_duel_reveals_at(pool_id, matchweek_number)` (129), and it carries
-- the same property for the same reason: the hold is measured from the previous
-- matchweek's `ranks_snapshot_at`, and the floor is that matchweek's own
-- `lock_at - 24h`. Both are ordered by LOCK TIME, never by number — 129's
-- `ORDER BY prev.lock_at DESC` is explicit about it. So reveal instants advance
-- in the order the football is actually played.
--
-- There is therefore an unseen walkout when
--
--     league_duel_reveals_at(pool_id, matchweek_number) > last_reveal_seen_at
--
-- ⚠ AND NOT `created_at`. Every duel of the season is inserted by the draw at
-- once (083), so `created_at` is the same instant for all 38 of them and would
-- say either "all unseen" or "all seen" forever.
--
-- The two degenerate answers both fall out correctly rather than needing a
-- rule. `-infinity` — the season's first playable matchweek, which is always
-- open — is never greater than a real stamp, so it is shown once and then not
-- again. `NULL` — a matchweek with no fixtures, including one the floor-of-5
-- has emptied (106) — makes the comparison NULL, which is not true, so nothing
-- is offered for a duel that can never be played.
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
-- it. If it is ever narrowed to column-level grants, `last_reveal_seen_at` MUST
-- be on the list alongside `last_recap_seen_at` — otherwise the walkout stops
-- marking itself watched and replays on every single visit, which is the most
-- irritating possible failure of this feature.

ALTER TABLE public.pool_entries
  ADD COLUMN IF NOT EXISTS last_reveal_seen_at timestamptz;

COMMENT ON COLUMN public.pool_entries.last_reveal_seen_at IS
  'When this entry last watched (or skipped) a duel walkout. There is an '
  'unseen walkout when league_duel_reveals_at(pool_id, matchweek_number) > '
  'this, or this is NULL. A TIMESTAMP, never a matchweek number: rounds are '
  'played out of numerical order (101 measured a minimum gap of minus 121 '
  'days), so a high-water mark on the number would stop a member ever seeing '
  'another walkout. NOT created_at either — the draw inserts every duel of the '
  'season at one instant (083). Written by the client on CLOSE, however it is '
  'closed, so nobody is trapped behind an animation that will not render. '
  'The durable replacement for the web''s per-device localStorage marker. '
  'Twin of last_recap_seen_at (122). Migration 136.';

-- -------------------------------------------------------------
-- The cold start
-- -------------------------------------------------------------
-- ⚠ WITHOUT THIS, EVERY EXISTING MEMBER IS WALKED OUT AGAINST AN OPPONENT THEY
-- HAVE KNOWN ABOUT FOR DAYS. `NULL` means "never seen", which is right for an
-- entry whose duel has not opened yet and wrong for one whose has.
--
-- Stamping `now()` says "every walkout already available has been had", which
-- is the intent — for members who watched it on the web it is literally true,
-- and for the rest the ceremony has no anticipation left to build about an
-- opponent already named on the card in front of them. The next matchweek to
-- reveal is later than the stamp, so it walks out normally.
--
-- ⚠ ONLY WHERE A DUEL IS ACTUALLY REVEALED, which is what the
-- `league_duel_reveals_at(...) <= now()` test is for. Stamping every showdown
-- entry unconditionally would burn the walkout for a pool whose first duel has
-- not opened yet — the members most entitled to see it.
--
-- ⚠ RUNS AS THE MIGRATION, SO IT SEES EVERY ROW. 116's RLS withholds a sealed
-- duel from a member's own client, but it does not filter this statement, so
-- the reveal instant has to be asked for explicitly rather than inferred from
-- a row being present. That difference is the whole reason this predicate is
-- not just `EXISTS (SELECT 1 FROM league_duels ...)` the way 122's is.
--
-- Scoped to showdown pools: no other mode has duels, and leaving the column
-- NULL elsewhere keeps it honest about never having been used there.

UPDATE public.pool_entries pe
   SET last_reveal_seen_at = now()
  FROM pool_members pm
  JOIN pools p ON p.pool_id = pm.pool_id
 WHERE pe.member_id = pm.member_id
   AND p.league_mode = 'showdown'
   AND pe.last_reveal_seen_at IS NULL
   AND EXISTS (
     SELECT 1 FROM league_duels d
      WHERE d.pool_id = p.pool_id
        AND (d.entry_a = pe.entry_id OR d.entry_b = pe.entry_id)
        AND league_duel_reveals_at(d.pool_id, d.matchweek_number) <= now()
   );

-- =============================================================
-- VERIFY
-- =============================================================
--   -- 1. The column exists and is nullable.
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_name = 'pool_entries'
--      AND column_name = 'last_reveal_seen_at';
--   -- expect: last_reveal_seen_at | timestamp with time zone | YES
--
--   -- 2. The seeded showdown pools are stamped (mw 3 is revealed), and
--   --    nothing outside showdown was touched.
--   SELECT p.league_mode,
--          count(*)                                        AS entries,
--          count(pe.last_reveal_seen_at)                    AS stamped
--     FROM pool_entries pe
--     JOIN pool_members pm ON pm.member_id = pe.member_id
--     JOIN pools p         ON p.pool_id    = pm.pool_id
--    GROUP BY p.league_mode;
--   -- expect: stamped > 0 ONLY on the 'showdown' row.
--
--   -- 3. The next walkout is still ahead of the stamp — i.e. the backfill
--   --    closed the door on what is open, not on what is coming.
--   SELECT d.matchweek_number,
--          league_duel_reveals_at(d.pool_id, d.matchweek_number) AS reveals_at,
--          league_duel_reveals_at(d.pool_id, d.matchweek_number) > now()
--            AS still_to_come
--     FROM league_duels d
--    WHERE d.pool_id = '5eed0003-0000-4000-8000-000000000003'
--    GROUP BY 1, 2
--    ORDER BY 1;
--   -- expect: mw 1-3 false (already revealed), mw 4+ true.
