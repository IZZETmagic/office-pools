-- =============================================================
-- 164 — THE DRAW WAITS FOR THE POOL
-- =============================================================
-- Ryan, 2026-10-04:
--
--   "the match ups should not just be picked once there are two people in the
--    pool because there may end up being many more people."
--
-- Then, choosing the rule:
--
--   "Make it 24 hours before the first matchweek kickoff for that pool.
--    Remember pools can be started at different matchweeks."
--
-- ## What was happening — measured on his own pool, not described
--
-- `Prem 2026/27 Showdown` (93c4115a), created 2026-09-25 with matchweek 6
-- chosen as its start. Matchweek 6's season-wide reveal instant was
-- 2026-09-21 — FOUR DAYS BEFORE THE POOL EXISTED — so the moment the second
-- member joined (2026-09-25 20:20) the generator drew matchweek 6 and the seal
-- let it straight through: IZZETmagic v mhcaldwell11, drawn and revealed in the
-- same second.
--
-- KevC joined on 2026-10-04, six days before matchweek 6 locks, and got no
-- matchweek-6 duel at all. 100/117/143 refuse to redraw the open matchweek once
-- it "has duels", so everyone who arrives after the second member is shut out of
-- the week the pool was created for.
--
-- ## Three things were wrong, and this file fixes all three
--
-- 1. **A pool's first draw had no clock of its own.** The reveal rule (116 →
--    138) is season-wide: a week opens a day after the previous one settles.
--    For a pool that starts mid-season that instant is almost always in the
--    past already, so "revealed" collapsed onto "the second member joined".
--
--    ⭐ NOW: a pool's first duel week opens 24 HOURS BEFORE THAT WEEK'S FIRST
--    KICKOFF (`first_kickoff_at`, NOT `lock_at`, which is an hour earlier —
--    101). Every pool has its own start week (143), so two pools in one season
--    get two different first draws. Every later week keeps the season rule.
--
-- 2. **The redraw line and the reveal line were two lines.** 117 is titled
--    "one line for the reveal and the redraw" and then froze a week the moment
--    it became the OPEN week and held duels — a pre-seal relic of 100, from when
--    the whole fixture list was published. Under the seal (116) nobody can see
--    an unrevealed week, so redrawing it costs nothing. Matchweek 7 in the same
--    pool would have frozen when matchweek 6 locked (10 Oct) and revealed about
--    three days later; anyone joining in between was stranded with nobody
--    having seen the draw.
--
--    ⭐ NOW: a week can be redrawn until it is DRAWN, and drawn means revealed.
--    That is `league_duel_is_revealed`, used as the ONE predicate by the
--    generator's DELETE, its loop, and the RLS policy.
--
-- 3. **A drawn week was only ever derived from a clock**, so it could be
--    UN-drawn. 138's own header documents the hazard: move the reveal instant
--    later and RLS withdraws a duel people have already watched. A kickoff
--    moved by the sync (105) does the same thing by accident.
--
--    ⭐ NOW: `league_duels.drawn_at` is written once by a one-minute cron the
--    moment a week's reveal instant passes, and a stamped duel is visible for
--    good. Visibility is "stamped OR its instant has passed", so the reveal still
--    lands on the second; the stamp only ever makes it permanent.
--
-- ## And the round-robin stops forgetting who has played whom
--
-- The circle method was restarted on every join from the matchweek's CALENDAR
-- position, with no memory of meetings already played. In the pool above that
-- scheduled IZZETmagic v mhcaldwell11 in matchweek 6 AND matchweek 9 while
-- KevC met each of them once — and a cycle that began mid-calendar could drop
-- rounds entirely.
--
-- The rounds are still the circle method's n−1 rounds for the current roster
-- (so a full pass is still a perfect round-robin), but each undrawn week now
-- takes the round whose pairs have met LEAST so far, byes counted the same way.
-- With a stable roster every round in a pass ties, so the order is the per-pass
-- hash — the same property 118 bought (no cycle repeats the last one's order).
-- After a join, rounds holding pairs that already met are played last.
--
-- ## ⚠ THE 24-HOUR HOLD IS RESTORED HERE, BECAUSE 138 WAS NEVER APPLIED
--
-- Checked live 2026-10-04: `league_duel_reveals_at` in production is 137's
-- throwaway body — `interval '6 hours 46 minutes 58.853394 seconds'` — not
-- 138's 24 hours. Every reveal since 2026-09-07 has opened ~6h47m after the
-- previous matchweek's last game. Ryan's considered answer (129, 2026-09-01) is
-- 24 hours, and this file rewrites the function anyway, so it lands 24 hours.
--
-- That is the dangerous direction 138 warned about — it moves reveal instants
-- LATER — and it is safe here only because the backfill below stamps every
-- currently-revealed duel FIRST. Nothing visible today can be withdrawn by it.
--
-- ## ⚠ BEFORE YOU RUN THIS — four live functions are REPLACED
-- =============================================================
--   SELECT proname, md5(prosrc) FROM pg_proc
--    WHERE proname IN ('league_generate_duel_schedule', 'league_duel_reveals_at',
--                      'league_duel_is_revealed', 'league_first_sealed_matchweek');
--   -- 2026-10-04, live:
--   --   league_generate_duel_schedule  9de9d188d9ec3e3c952950a8013f1d94  (143)
--   --   league_duel_reveals_at         5aeb9f2006caaa5ffd43fd013c60d73e  (137!)
--   --   league_duel_is_revealed        2bc8c3d3ce7755351589c2850317e662  (123)
--   --   league_first_sealed_matchweek  7771cdcb56429b71375c8998db4ceff3  (127)
--
-- ⚠ ORDER IS LOAD-BEARING: column → backfill (under the OLD reveal rule) →
-- new functions → policy → regenerate every Showdown pool → cron. Stamping after
-- the switch would let the new, later instants re-seal duels people have seen.
-- =============================================================

BEGIN;

-- =============================================================
-- 1. The draw as a stored fact
-- =============================================================

ALTER TABLE public.league_duels
  ADD COLUMN IF NOT EXISTS drawn_at timestamptz;

COMMENT ON COLUMN public.league_duels.drawn_at IS
  'The instant this duel''s matchweek was drawn for this pool — which IS the '
  'instant it was revealed. Written once, by league_stamp_drawn_duels() (a '
  'one-minute cron), and never cleared: a stamped duel is visible for good even '
  'if league_duel_reveals_at later moves. NULL means the week is still '
  'provisional — sealed by RLS, and rebuilt by league_generate_duel_schedule on '
  'every join or leave. Migration 164.';

-- The cron's working set: every duel not yet drawn. Small by construction —
-- only the future — and the stamp only ever shrinks it.
CREATE INDEX IF NOT EXISTS idx_duels_undrawn
  ON public.league_duels (pool_id, matchweek_number)
  WHERE drawn_at IS NULL;

-- =============================================================
-- 2. Backfill — under the OLD rule, before anything else changes
-- =============================================================
-- Every duel visible right now stays visible. The stamp is the instant it
-- actually opened (its reveal, or the moment the row was written if that was
-- later — the second-member case above), never now(), so the column is history
-- rather than a record of when this migration ran.
--
-- ⭐ ONE DELIBERATE EXCEPTION — Ryan's call, 2026-10-04: his own pool's
-- matchweek 6 is NOT stamped. Under the new rule its first draw is
-- 2026-10-09 11:30 UTC (matchweek 6's first kickoff, Sat 10 Oct 11:30, minus 24
-- hours), so leaving it unstamped re-seals IZZETmagic v mhcaldwell11 until then
-- and the regeneration in step 6 redraws it with KevC in it. The redraw mints new
-- duel ids, so 136's per-duel marker does not match and the walkout plays again
-- — which is the right answer for a duel that is genuinely new.
--
-- ⚠ GUARDED: only while matchweek 6 is still unlocked and unsettled. Applied
-- after it locks, the exception does nothing and the week is stamped like any
-- other — a locked week's opponent is not ours to change.

UPDATE public.league_duels d
   SET drawn_at = LEAST(now(), GREATEST(
         d.created_at,
         COALESCE(NULLIF(public.league_duel_reveals_at(d.pool_id, d.matchweek_number),
                         '-infinity'::timestamptz),
                  d.created_at)))
 WHERE d.drawn_at IS NULL
   AND public.league_duel_is_revealed(d.pool_id, d.matchweek_number)
   AND NOT (
         d.pool_id = '93c4115a-43da-47b7-9c99-463bbd95c053'
     AND d.matchweek_number = 6
     AND d.settled_at IS NULL
     AND EXISTS (
           SELECT 1
             FROM public.pools p
             JOIN public.league_matchweeks m
               ON m.season_id = p.league_season_id AND m.matchweek_number = 6
            WHERE p.pool_id = d.pool_id
              AND m.lock_at > now())
   );

-- =============================================================
-- 3. Which matchweeks a Showdown pool duels in, and which comes first
-- =============================================================
-- ⭐ THE ONE DEFINITION. The reveal clock, the generator and the create route
-- all ask these two functions; none of them re-derives the rule.
--
-- A pool duels in a matchweek when BOTH:
--   · it is at or after the pool's start matchweek (143's column, a floor read
--     by NUMBER exactly as 143 reads it for every other mode), and
--   · its draw — 24 hours before its first kickoff — was still ahead when the
--     pool was created. A pool created on the Friday night before its start
--     week cannot draw that week fairly (the draw has passed), so that week is
--     not one of its duel weeks. The create route stores a start week that
--     already satisfies this, so for every pool it creates the second clause is
--     a guard, not a behaviour.
--
-- ⚠ `created_at`, never now(). Membership is a property of the pool, fixed at
-- birth; read against now() it would drop every week from the pool as the
-- season passed it.
--
-- A week with no fixtures yet (NULL first_kickoff_at) counts as a duel week if
-- it is past the start: it is in the future by construction and gets its clock
-- when its fixtures arrive.

CREATE OR REPLACE FUNCTION public.league_showdown_first_matchweek_for(
  p_season_id uuid,
  p_floor     integer,
  p_at        timestamptz
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  -- The earliest matchweek, in LOCK order (101 — rounds are played out of
  -- numerical order), at or past the floor, whose first draw is still ahead of
  -- `p_at`. Used by the create route with p_at = now() to resolve the start it
  -- stores, and by league_showdown_first_matchweek with the pool's created_at.
  SELECT m.matchweek_number
    FROM league_matchweeks m
   WHERE m.season_id = p_season_id
     AND m.first_kickoff_at IS NOT NULL
     AND m.matchweek_number >= COALESCE(p_floor, 1)
     AND m.first_kickoff_at - interval '24 hours' > p_at
   ORDER BY m.lock_at, m.matchweek_number
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_showdown_first_matchweek_for(uuid, integer, timestamptz) IS
  'The first matchweek (lock order) at or past p_floor whose first Showdown draw '
  '— 24 hours before its first kickoff — is still ahead of p_at. The create route '
  'calls it with now() to resolve the start week it stores for a Showdown pool; '
  'league_showdown_first_matchweek calls it with the pool''s created_at. NULL '
  'when the season has no such week left. Migration 164.';

CREATE OR REPLACE FUNCTION public.league_showdown_plays_matchweek(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((
    SELECT m.matchweek_number >= COALESCE(p.league_start_matchweek, 1)
       AND (m.first_kickoff_at IS NULL
            OR m.first_kickoff_at - interval '24 hours' > p.created_at)
      FROM pools p
      JOIN league_matchweeks m
        ON m.season_id = p.league_season_id
       AND m.matchweek_number = p_matchweek_number
     WHERE p.pool_id = p_pool_id
       AND p.league_mode = 'showdown'
     LIMIT 1), false);
$fn$;

COMMENT ON FUNCTION public.league_showdown_plays_matchweek(uuid, integer) IS
  'Does this Showdown pool duel in this matchweek? At or past its start week '
  '(143), and the week''s draw — 24h before its first kickoff — was still ahead '
  'when the pool was created. False for every other mode. Migration 164.';

CREATE OR REPLACE FUNCTION public.league_showdown_first_matchweek(p_pool_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.league_showdown_first_matchweek_for(
           p.league_season_id, p.league_start_matchweek, p.created_at)
    FROM pools p
   WHERE p.pool_id = p_pool_id
     AND p.league_mode = 'showdown';
$fn$;

COMMENT ON FUNCTION public.league_showdown_first_matchweek(uuid) IS
  'The matchweek this Showdown pool''s first duel is in — whose draw is the '
  'pool''s own clock (24h before that week''s first kickoff) rather than the '
  'season''s. NULL for any other mode, or a pool with no duel week left. '
  'Migration 164.';

-- =============================================================
-- 4. The reveal clock — per pool for its first week, season-wide after
-- =============================================================
-- Three arms, in order:
--
--   · not a week this pool duels in → NULL. No duel exists to open. (Was: the
--     season's answer, so a pool starting at matchweek 8 carried "revealed"
--     instants for matchweeks it would never play.)
--   · the pool's FIRST duel week → 24 hours before that week's first kickoff.
--     Ryan's rule. It replaces 119's `-infinity` base case, which opened the
--     season's first week at once — the same collapse onto "second member
--     joined", for every pool created before the season.
--   · every later week → 129's rule, unchanged in shape: 24 hours after the
--     previous matchweek (LOCK order) settles, or 24 hours before this one
--     locks, whichever is first. ⚠ 24 HOURS — see the header: production was
--     still running 137's 6h46m58s throwaway.

CREATE OR REPLACE FUNCTION public.league_duel_reveals_at(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN NOT public.league_showdown_plays_matchweek(p_pool_id, p_matchweek_number)
      THEN NULL
    -- ⬅ 164. The pool's own first draw (Ryan, 2026-10-04).
    WHEN m.matchweek_number = public.league_showdown_first_matchweek(p_pool_id)
      THEN m.first_kickoff_at - interval '24 hours'
    ELSE LEAST(
      -- The hold. NULL while the previous matchweek is unsettled — and LEAST
      -- IGNORES NULLS in Postgres, so an unsettled predecessor falls through to
      -- the floor rather than making the whole expression NULL.
      -- 129: a day after the previous matchweek's last game (Ryan, 2026-09-01).
      (SELECT prev.ranks_snapshot_at + interval '24 hours'
         FROM league_matchweeks prev
        WHERE prev.season_id = m.season_id
          AND prev.lock_at IS NOT NULL
          AND (prev.lock_at, prev.matchweek_number) < (m.lock_at, m.matchweek_number)
        ORDER BY prev.lock_at DESC, prev.matchweek_number DESC
        LIMIT 1),
      -- The floor (120): never later than 24h before you have to pick.
      m.lock_at - interval '24 hours'
    )
  END
    FROM pools p
    JOIN league_matchweeks m
      ON m.season_id = p.league_season_id
     AND m.matchweek_number = p_matchweek_number
   WHERE p.pool_id = p_pool_id
     -- No fixtures yet means no duel to open. Also seals a matchweek the
     -- floor-of-5 has emptied (106); those duels can never settle either.
     AND m.lock_at IS NOT NULL
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION public.league_duel_reveals_at(uuid, integer) IS
  'The instant this pool''s duel for this matchweek is drawn and opens. The '
  'pool''s FIRST duel week: 24 hours before that week''s first kickoff (Ryan, '
  '2026-10-04 — each pool has its own start week, so its own first draw). Every '
  'later week: 24 hours after the previous matchweek (lock order) settles, or '
  '24 hours before this one locks, whichever is first (129/120). NULL for a week '
  'the pool does not duel in, or one with no fixtures. ⚠ This is the SCHEDULED '
  'instant; once league_duels.drawn_at is stamped the duel stays open even if '
  'this later moves. Migrations 116 → 119 → 120 → 123 → 129 → 137 → 164 (138 was '
  'never applied).';

-- =============================================================
-- 5. Revealed = stamped, or its instant has passed
-- =============================================================
-- The one predicate. The generator refuses to redraw a week it says yes to,
-- RLS shows a week it says yes to, and the duel-reveal route and pool cards
-- (poolCards.ts GATE B) ask it by name. The stamp half means a reveal can never
-- be taken back; the clock half means it lands on the second rather than at the
-- cron's next minute.

CREATE OR REPLACE FUNCTION public.league_duel_is_revealed(
  p_pool_id          uuid,
  p_matchweek_number integer
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
           SELECT 1 FROM league_duels d
            WHERE d.pool_id = p_pool_id
              AND d.matchweek_number = p_matchweek_number
              AND d.drawn_at IS NOT NULL)
      OR COALESCE(
           public.league_duel_reveals_at(p_pool_id, p_matchweek_number) <= now(),
           false);
$fn$;

COMMENT ON FUNCTION public.league_duel_is_revealed(uuid, integer) IS
  'Has this pool''s duel for this matchweek been drawn? True once any of the '
  'week''s duels is stamped (league_duels.drawn_at), or once '
  'league_duel_reveals_at has passed. The ONE predicate for the seal (RLS), the '
  'redraw line (league_generate_duel_schedule) and the server-side readers. '
  'Migrations 116 → 123 → 164.';

-- The sealed card's week: unchanged except that it asks the predicate above
-- instead of comparing the clock itself (so a stamped week is never offered as
-- sealed), and `opens_after` is NULL for the pool's first duel week — that week
-- opens on its own clock, not after a predecessor settles.
CREATE OR REPLACE FUNCTION public.league_first_sealed_matchweek(p_pool_id uuid)
RETURNS TABLE (
  matchweek_number integer,
  reveals_at       timestamptz,
  opens_after      integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH ordered AS (
    SELECT m.matchweek_number,
           m.lock_at,
           -- ⚠ THE ONE DEFINITION. Not re-derived, not mirrored: called.
           league_duel_reveals_at(p_pool_id, m.matchweek_number) AS reveals_at,
           LAG(m.matchweek_number) OVER (ORDER BY m.lock_at, m.matchweek_number)
             AS prev_number
      FROM pools p
      JOIN league_matchweeks m ON m.season_id = p.league_season_id
     WHERE p.pool_id = p_pool_id
       AND m.lock_at IS NOT NULL
  )
  SELECT o.matchweek_number,
         o.reveals_at,
         -- ⬅ 164. The first duel week waits for a clock, not a result.
         CASE WHEN o.matchweek_number = league_showdown_first_matchweek(p_pool_id)
              THEN NULL ELSE o.prev_number END
    FROM ordered o
   WHERE o.reveals_at IS NOT NULL
     AND NOT league_duel_is_revealed(p_pool_id, o.matchweek_number)   -- ⬅ 164
   ORDER BY o.lock_at, o.matchweek_number
   LIMIT 1;
$fn$;

-- =============================================================
-- 6. The generator — redraws anything not yet drawn, remembering who has met
-- =============================================================

CREATE OR REPLACE FUNCTION public.league_generate_duel_schedule(p_pool_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_mode      text;
  v_season    uuid;
  v_first     integer;
  v_base      uuid[];
  v_n         integer;
  v_rounds    integer;
  v_from_mw   integer;
  v_prev_mw   integer;
  v_mw        integer;
  v_r         integer;
  v_i         integer;
  v_a         uuid;
  v_b         uuid;
  v_written   integer := 0;
BEGIN
  SELECT league_mode, league_season_id INTO v_mode, v_season
    FROM pools WHERE pool_id = p_pool_id;
  IF v_mode IS DISTINCT FROM 'showdown' OR v_season IS NULL THEN
    RETURN jsonb_build_object('skipped', 'not a showdown pool');
  END IF;

  -- Ordered by created_at so the circle is STABLE: the same roster always
  -- yields the same n−1 rounds, which is what lets a regeneration with nobody
  -- joining reproduce the schedule exactly.
  SELECT array_agg(pe.entry_id ORDER BY pe.created_at, pe.entry_id)
    INTO v_base
    FROM pool_entries pe
    JOIN pool_members pm ON pe.member_id = pm.member_id
   WHERE pm.pool_id = p_pool_id
     AND pe.retired_at IS NULL;

  -- ⭐ THE REDRAW LINE IS THE REVEAL LINE. Everything not yet drawn goes —
  -- including rows before the pool's first duel week, which 143 deliberately
  -- leaves unfiltered so a stray early row is removed and never redrawn.
  -- `settled_at` and `drawn_at` are belt and braces: a settled or stamped week
  -- is revealed by definition, but neither guard costs anything.
  --
  -- ⚠ This now runs BEFORE the fewer-than-two return. 143's version deleted
  -- EVERY unsettled duel there, revealed or not — so the second-to-last member
  -- leaving silently erased a duel the other one was in the middle of. A drawn
  -- duel with a departed opponent stays, and 134 settles it as a bye.
  DELETE FROM league_duels d
   USING league_matchweeks m
   WHERE d.pool_id = p_pool_id
     AND d.settled_at IS NULL
     AND d.drawn_at IS NULL
     AND m.season_id = v_season
     AND m.matchweek_number = d.matchweek_number
     AND (m.lock_at IS NULL OR m.lock_at > now())
     AND NOT league_duel_is_revealed(p_pool_id, d.matchweek_number);

  IF v_base IS NULL OR array_length(v_base, 1) < 2 THEN
    RETURN jsonb_build_object('skipped', 'fewer than two entries', 'written', 0);
  END IF;

  IF league_open_matchweek(v_season) IS NULL THEN
    RETURN jsonb_build_object('skipped', 'no open matchweek left', 'written', 0);
  END IF;

  -- The padding entry. Whoever it lands opposite has a bye that matchweek.
  IF array_length(v_base, 1) % 2 = 1 THEN
    v_base := v_base || ARRAY[NULL]::uuid[];
  END IF;
  v_n := array_length(v_base, 1);
  v_rounds := v_n - 1;

  v_first := league_showdown_first_matchweek(p_pool_id);

  -- The last week already on the books — every surviving row is drawn, settled
  -- or locked, so in lock order it precedes everything about to be written.
  -- Its pairs are the ones the first new week must not repeat (see the
  -- tie-break below).
  SELECT d.matchweek_number INTO v_prev_mw
    FROM league_duels d
    JOIN league_matchweeks m
      ON m.season_id = v_season AND m.matchweek_number = d.matchweek_number
   WHERE d.pool_id = p_pool_id
   ORDER BY m.lock_at DESC NULLS FIRST, m.matchweek_number DESC
   LIMIT 1;

  FOR v_mw IN
    SELECT m.matchweek_number
      FROM league_matchweeks m
     WHERE m.season_id = v_season
       AND league_showdown_plays_matchweek(p_pool_id, m.matchweek_number)
       AND (m.lock_at IS NULL OR m.lock_at > now())
       AND NOT league_duel_is_revealed(p_pool_id, m.matchweek_number)
     ORDER BY m.lock_at NULLS LAST, m.matchweek_number
  LOOP
    IF v_from_mw IS NULL THEN v_from_mw := v_mw; END IF;

    -- ⭐ THE ROUND WHOSE PAIRS HAVE MET LEAST. Round r of the circle method is
    -- the arrangement [base1, rotate(base2..n, r)] folded first-against-last;
    -- position i meets position n+1−i. A pair's key is its two entries in a
    -- fixed order, or `entry|-` for a bye, so byes are balanced by the same
    -- arithmetic as opponents.
    --
    -- `met` is read from league_duels on EVERY iteration, so the weeks this
    -- call has just written count as history for the next — the simulation is
    -- the table itself. Rows naming a departed entry match no current pair and
    -- drop out on their own.
    --
    -- Tie-break, in order:
    --   1. not a round holding a pair (or a bye) from the week just before.
    --      Only ever decides at a PASS BOUNDARY — inside a pass the previous
    --      week's round is already played and loses on meetings — and it is
    --      what stops a new pass opening with the round the last one closed on:
    --      the same opponent two weeks running, or two byes in a row. Found in
    --      the dry-run on Ryan's pool (matchweeks 8 → 9).
    --   2. a hash of the pool, the tie LEVEL and the round. With a stable roster
    --      every unplayed round in a pass ties at the same level, so the order
    --      within a pass is that hash, and the next pass (a higher level) gets a
    --      different one — 118's per-cycle permutation, without 118's calendar
    --      arithmetic. ⚠ NOT "longest since last met": that would make every
    --      pass replay the first one's order, which is the exact derivability
    --      118 was written to remove.
    WITH met AS (
      SELECT CASE WHEN d.entry_b IS NULL THEN d.entry_a::text || '|-'
                  WHEN d.entry_a < d.entry_b THEN d.entry_a::text || '|' || d.entry_b::text
                  ELSE d.entry_b::text || '|' || d.entry_a::text END AS k,
             count(*) AS c
        FROM league_duels d
       WHERE d.pool_id = p_pool_id
       GROUP BY 1
    ), seats AS (
      SELECT g.r,
             CASE WHEN p.i = 1 THEN v_base[1]
                  ELSE v_base[2 + ((p.i - 2 + g.r) % v_rounds)] END AS x,
             v_base[2 + ((v_n - 1 - p.i + g.r) % v_rounds)] AS y
        FROM generate_series(0, v_rounds - 1) AS g(r)
       CROSS JOIN generate_series(1, v_n / 2) AS p(i)
    ), keyed AS (
      SELECT s.r,
             CASE WHEN s.x IS NULL THEN s.y::text || '|-'
                  WHEN s.y IS NULL THEN s.x::text || '|-'
                  WHEN s.x < s.y THEN s.x::text || '|' || s.y::text
                  ELSE s.y::text || '|' || s.x::text END AS k
        FROM seats s
    ), last_week AS (
      SELECT CASE WHEN d.entry_b IS NULL THEN d.entry_a::text || '|-'
                  WHEN d.entry_a < d.entry_b THEN d.entry_a::text || '|' || d.entry_b::text
                  ELSE d.entry_b::text || '|' || d.entry_a::text END AS k
        FROM league_duels d
       WHERE d.pool_id = p_pool_id
         AND d.matchweek_number = v_prev_mw
    ), scored AS (
      SELECT k.r,
             COALESCE(SUM(met.c), 0) AS s,
             bool_or(lw.k IS NOT NULL) AS repeats_last_week
        FROM keyed k
        LEFT JOIN met ON met.k = k.k
        LEFT JOIN last_week lw ON lw.k = k.k
       GROUP BY k.r
    ), levelled AS (
      SELECT sc.r, sc.s, sc.repeats_last_week, MIN(sc.s) OVER () AS lvl FROM scored sc
    )
    SELECT l.r INTO v_r
      FROM levelled l
     ORDER BY l.s,
              l.repeats_last_week,
              md5(p_pool_id::text || ':' || l.lvl::text || ':' || l.r::text)
     LIMIT 1;

    FOR v_i IN 1 .. v_n / 2 LOOP
      v_a := CASE WHEN v_i = 1 THEN v_base[1]
                  ELSE v_base[2 + ((v_i - 2 + v_r) % v_rounds)] END;
      v_b := v_base[2 + ((v_n - 1 - v_i + v_r) % v_rounds)];

      -- Keep the padding on side B, so entry_a is always a real entry and the
      -- NOT NULL holds.
      IF v_a IS NULL THEN
        v_a := v_b;
        v_b := NULL;
      END IF;

      INSERT INTO league_duels (pool_id, matchweek_number, entry_a, entry_b)
      VALUES (p_pool_id, v_mw, v_a, v_b)
      ON CONFLICT DO NOTHING;
      v_written := v_written + 1;
    END LOOP;

    v_prev_mw := v_mw;
  END LOOP;

  RETURN jsonb_build_object(
    'written', v_written,
    'entries', v_n - (CASE WHEN v_base[v_n] IS NULL THEN 1 ELSE 0 END),
    'rounds_per_cycle', v_rounds,
    'from_matchweek', v_from_mw,
    -- ⬅ 164. The pool's first duel week, so an operator can tell "not started"
    -- from "no entries" — both write zero duels.
    'first_duel_matchweek', v_first,
    'pool_starts_at', v_first
  );
END;
$fn$;

-- =============================================================
-- 7. The stamp — what makes a draw permanent
-- =============================================================
-- Stamps every not-yet-drawn duel whose week's reveal instant has passed, with
-- THAT instant (not now()), so `drawn_at` says when the draw happened rather
-- than when the cron noticed.
--
-- ⚠ The 60-day window is a cost bound, not a rule. Visibility never waits for
-- the stamp (league_duel_is_revealed accepts the clock), so a week outside the
-- window is still revealed on time; it is only stamped later. Without the
-- window this calls league_duel_reveals_at for every future (pool, week) every
-- minute — 38 per pool, growing with the product.

CREATE OR REPLACE FUNCTION public.league_stamp_drawn_duels()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  WITH due AS (
    SELECT DISTINCT d.pool_id, d.matchweek_number
      FROM league_duels d
      JOIN pools p ON p.pool_id = d.pool_id
      JOIN league_matchweeks m
        ON m.season_id = p.league_season_id
       AND m.matchweek_number = d.matchweek_number
     WHERE d.drawn_at IS NULL
       AND m.first_kickoff_at IS NOT NULL
       AND m.first_kickoff_at <= now() + interval '60 days'
  ), opened AS (
    SELECT due.pool_id, due.matchweek_number,
           league_duel_reveals_at(due.pool_id, due.matchweek_number) AS at
      FROM due
  ), stamped AS (
    UPDATE league_duels d
       SET drawn_at = o.at
      FROM opened o
     WHERE d.pool_id = o.pool_id
       AND d.matchweek_number = o.matchweek_number
       AND d.drawn_at IS NULL
       AND o.at <= now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM stamped;
$fn$;

COMMENT ON FUNCTION public.league_stamp_drawn_duels() IS
  'Stamps league_duels.drawn_at on every duel whose week''s reveal instant has '
  'passed, with that instant. Run every minute by cron job '
  'league-duel-draw-stamp. Idempotent. Returns rows stamped. Migration 164.';

-- =============================================================
-- Grants — the engines are not public (102)
-- =============================================================
-- The three membership helpers are called from inside SECURITY DEFINER
-- functions and need no grant of their own. Supabase's default privileges hand
-- EXECUTE to anon and authenticated on every new function in `public`, so
-- revoking PUBLIC alone is not enough.
REVOKE EXECUTE ON FUNCTION public.league_showdown_plays_matchweek(uuid, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.league_showdown_first_matchweek(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.league_stamp_drawn_duels()
  FROM PUBLIC, anon, authenticated;
-- The create route resolves a start week through this, as service_role.
REVOKE EXECUTE ON FUNCTION public.league_showdown_first_matchweek_for(uuid, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.league_showdown_first_matchweek_for(uuid, integer, timestamptz)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.league_stamp_drawn_duels() TO service_role;

-- =============================================================
-- 8. The seal — the policy reads the row's own stamp first
-- =============================================================
-- Same membership half as 116. The reveal half checks THIS row's stamp before
-- calling the predicate, which is both cheaper and the clearest statement of
-- the rule: a drawn duel is visible to the pool, full stop.

DROP POLICY IF EXISTS "Members see duels up to the open matchweek" ON public.league_duels;
DROP POLICY IF EXISTS "Members see duels once they are drawn" ON public.league_duels;
CREATE POLICY "Members see duels once they are drawn"
  ON public.league_duels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
        FROM pool_members pm
        JOIN users u ON pm.user_id = u.user_id
       WHERE pm.pool_id = league_duels.pool_id
         AND u.auth_user_id = (SELECT auth.uid())
    )
    AND (
      league_duels.drawn_at IS NOT NULL
      OR league_duel_is_revealed(league_duels.pool_id, league_duels.matchweek_number)
    )
  );

-- =============================================================
-- 9. Regenerate every Showdown pool under the new rules
-- =============================================================
-- Touches only undrawn weeks, so nothing anybody has seen moves. What it does:
--   · reorders the provisional (sealed) weeks under the history-aware rule
--   · redraws Ryan's matchweek 6 with all three members (the exception above)
--   · removes provisional rows in weeks a pool no longer duels in

DO $regen$
DECLARE
  v_pool uuid;
  v_out  jsonb;
BEGIN
  FOR v_pool IN SELECT pool_id FROM pools WHERE league_mode = 'showdown' ORDER BY created_at LOOP
    v_out := public.league_generate_duel_schedule(v_pool);
    RAISE NOTICE '164 regenerate %: %', v_pool, v_out;
  END LOOP;
END
$regen$;

COMMIT;

-- =============================================================
-- 10. The cron — outside the transaction, like 135 and 161
-- =============================================================
-- Pure SQL, every minute, like `shadow-reconcile`. No HTTP, no secret: it calls
-- one function that only ever writes a timestamp onto rows that are already
-- revealed.

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job j WHERE j.jobname = 'league-duel-draw-stamp') THEN
    PERFORM cron.unschedule('league-duel-draw-stamp');
  END IF;
  PERFORM cron.schedule(
    'league-duel-draw-stamp',
    '* * * * *',
    $job$SELECT public.league_stamp_drawn_duels()$job$
  );
END
$cron$;

-- Stamp anything already due, rather than waiting a minute for the first run.
SELECT public.league_stamp_drawn_duels();

-- =============================================================
-- VERIFY
-- =============================================================
--   -- 1. Nothing that was visible before is hidden now. Run BEFORE applying,
--   --    keep the count, and compare (2026-10-04: 46 revealed rows, of which
--   --    1 is Ryan's matchweek 6 and is meant to go):
--   select count(*) from league_duels d
--    where league_duel_is_revealed(d.pool_id, d.matchweek_number);
--
--   -- 2. Ryan's pool: matchweek 6 sealed until Fri 9 Oct 11:30 UTC, three
--   --    members in it, IZZETmagic v mhcaldwell11 not repeated before KevC has
--   --    met both:
--   select m.matchweek_number,
--          league_duel_reveals_at('93c4115a-43da-47b7-9c99-463bbd95c053', m.matchweek_number) as reveals_at,
--          league_duel_is_revealed('93c4115a-43da-47b7-9c99-463bbd95c053', m.matchweek_number) as revealed,
--          (select count(*) from league_duels d
--            where d.pool_id = '93c4115a-43da-47b7-9c99-463bbd95c053'
--              and d.matchweek_number = m.matchweek_number) as duels
--     from league_matchweeks m
--    where m.season_id = (select league_season_id from pools
--                          where pool_id = '93c4115a-43da-47b7-9c99-463bbd95c053')
--      and m.matchweek_number between 5 and 10
--    order by m.lock_at;
--   -- expect mw5: reveals_at NULL; mw6: 2026-10-09 11:30:00+00, revealed f, 2 duels
--
--   -- 3. The cron is live and stamping (pure SQL, so job_run_details IS the
--   --    proof here — there is no HTTP leg):
--   select status, return_message, start_time from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'league-duel-draw-stamp')
--    order by start_time desc limit 3;
--
--   -- 4. After Fri 9 Oct 11:31 UTC: matchweek 6 stamped, at 11:30:00 exactly.
--   select drawn_at from league_duels
--    where pool_id = '93c4115a-43da-47b7-9c99-463bbd95c053' and matchweek_number = 6;
