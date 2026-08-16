# Premier League backend — design + adversarial review

> **Status:** for Ryan, 2026-08-15. NOTHING BUILT. Produced by an 8-agent audit → design → review
> pass over the live schema and the code on `master`.
>
> **The decision this implements (Ryan, 2026-08-15):** every competition gets its own backend
> structure; the Premier League is built ground-up; the World Cup backend is frozen and restored;
> the front end reuses the existing World Cup UI repointed at league data; predictions fork into
> their own table while `pools` / `pool_members` / `pool_entries` and everything hanging off an
> entry stay shared.
>
> **Audit scale:** 103 front-end fixture/prediction consumers, 77 readers of the `predictions`
> table, 43 revert items.
>
> ⚠ **All three reviews returned `sound-with-fixes`, with 8 CRITICAL findings between them.**
> The design is not buildable as written. §R lists what must change first.

---

I have what I need. Here is the design.

---

# Premier League backend — concrete design

Grounded in the live schema (`ujthamlehjyubbzxbnes`, read-only queries), the four audits, and the code as it stands on `master`.

Two verified facts drive most of the design, and both are new to this document:

1. **`broadcast_pool_leaderboard()` is table-agnostic.** Its body reads only `new_rows.{pool_id, entry_id, match_points, bonus_points, total_points, final_rank, previous_final_rank}` and calls `realtime.send(... 'pool:'||pool_id||':leaderboard')`. It can be attached verbatim to a *new* table whose columns carry those names. That means the league can get its own totals table without forking the realtime leaderboard, `liveMerge.ts`, or the client subscription at `app/pools/[pool_id]/PoolDetail.tsx:769-782`.
2. **`shadow_reconcile_adjustments` (cron jobid 20) will actively corrupt a league pool.** Its selector is unscoped: `pool_entries JOIN pool_members JOIN pools LEFT JOIN shadow_entry_totals WHERE (se.entry_id IS NULL AND COALESCE(pe.point_adjustment,0) <> 0)`. A league entry with any admin adjustment gets selected, `shadow_finalize_totals` inserts a **zeroed** `shadow_entry_totals` row for it, and the INSERT trigger **broadcasts those zeros onto the league pool's live leaderboard topic**. This is not a silent-empty — it is a wrong-data push, and it is armed today. §3 handles it.

---

## 1. DDL sketch

Seven new tables. Prefix `league_`. Nothing named for a bracket; nothing named for a country.

### 1.1 `league_seasons` — the competition instance

```sql
CREATE TABLE league_seasons (
  season_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_slug      text        NOT NULL,   -- 'premier-league'
  competition_name      text        NOT NULL,   -- 'Premier League'
  season_label          text        NOT NULL,   -- '2026/27'
  season_start_year     integer     NOT NULL,   -- 2026
  country_code          char(3)     NOT NULL,   -- 'ENG'
  club_count            integer     NOT NULL,   -- 20
  matchweek_count       integer     NOT NULL,   -- 38
  first_kickoff_at      timestamptz,
  last_kickoff_at       timestamptz,
  logo_url              text,
  external_provider     text        NOT NULL DEFAULT 'api_football',
  external_league_id    integer     NOT NULL,   -- 39
  external_season       integer     NOT NULL,   -- 2026
  regular_season_phase  text        NOT NULL,   -- 'Regular Season' — the feed's own string, verbatim
  imported_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_seasons_provider_key  UNIQUE (external_provider, external_league_id, external_season),
  CONSTRAINT league_seasons_slug_year_key UNIQUE (competition_slug, season_start_year),
  CONSTRAINT league_seasons_clubs_ck      CHECK (club_count BETWEEN 4 AND 30),
  CONSTRAINT league_seasons_mw_ck         CHECK (matchweek_count BETWEEN 1 AND 60)
);
```

No `status` column, on purpose — `lib/competitionFormat.ts:hasCompetitionEnded` already establishes that competition state is date-computed, never authored (`tournaments.status` still read `'upcoming'` a month after the final). Derive from `last_kickoff_at`.

No `num_groups` / `teams_per_group` / `host_countries` — the three NOT NULL columns on `tournaments` that make a league impossible to represent honestly there.

### 1.2 `league_clubs`

```sql
CREATE TABLE league_clubs (
  club_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  name             text    NOT NULL,      -- 'Manchester United'   (was teams.country_name)
  short_name       text    NOT NULL,      -- 'Man Utd'
  abbreviation     char(3) NOT NULL,      -- 'MUN'                 (was teams.country_code)
  crest_url        text,                  --                       (was teams.flag_url)
  external_club_id integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_clubs_season_ext_key  UNIQUE (season_id, external_club_id),
  CONSTRAINT league_clubs_season_abbr_key UNIQUE (season_id, abbreviation),
  CONSTRAINT league_clubs_season_name_key UNIQUE (season_id, name)
);
CREATE INDEX idx_league_clubs_season ON league_clubs(season_id);
```

Gone: `group_letter`, `group_position`, `fifa_ranking_points`, `final_position`. `short_name` is new and earns its place — `lib/poolData.ts:182` sorts the World Cup team list by `group_letter, fifa_ranking_points`; a club list has no such ordering and the UI needs a name that fits a match card.

Note this also **neutralises the unscoped-`teams` bug** at `lib/poolData.ts:182` for free: that query has no `tournament_id` filter, so a second competition's rows landed in every pool's team list. With clubs in their own table they cannot.

### 1.3 `league_matchweeks` — first-class, because the lock lives here

```sql
CREATE TABLE league_matchweeks (
  matchweek_id     uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  matchweek_number integer NOT NULL,          -- 1..38
  label            text    NOT NULL,          -- 'Matchweek 7'
  provider_round   text    NOT NULL,          -- 'Regular Season - 7', verbatim
  fixture_count    integer NOT NULL DEFAULT 0,
  first_kickoff_at timestamptz,
  last_kickoff_at  timestamptz,
  lock_at          timestamptz,               -- == first_kickoff_at. THE deadline.
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_matchweeks_season_no_key    UNIQUE (season_id, matchweek_number),
  CONSTRAINT league_matchweeks_season_round_key UNIQUE (season_id, provider_round),
  CONSTRAINT league_matchweeks_no_ck            CHECK (matchweek_number BETWEEN 1 AND 60)
);
CREATE INDEX idx_league_matchweeks_season_no ON league_matchweeks(season_id, matchweek_number);
```

`UNIQUE (season_id, provider_round)` **structurally kills the Belgium/Scotland ordinal-collision class** documented at `lib/integrations/apiFootball/importLeagueSeason.ts:365-385`. Today that is an importer-time `throw`; here two rounds sharing an ordinal cannot both exist, and two phases sharing an ordinal produce two rows that then violate the `matchweek_number` unique. The guard moves from procedural to declarative.

`lock_at` as a stored column is the other reason matchweeks are first-class. The live `enforce_prediction_before_kickoff` (read from `pg_get_functiondef`) computes the league deadline as `MIN(match_date) ... WHERE tournament_id = ? AND round_number = ? AND stage='regular_season'` — an aggregate **on every prediction insert and update**. With a stored `lock_at` it is one indexed lookup.

### 1.4 `league_fixtures`

```sql
CREATE TABLE league_fixtures (
  fixture_id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             uuid    NOT NULL REFERENCES league_seasons(season_id)   ON DELETE CASCADE,
  matchweek_id          uuid    NOT NULL REFERENCES league_matchweeks(matchweek_id) ON DELETE CASCADE,
  fixture_number        integer NOT NULL,        -- 1..380, kickoff order at import
  home_club_id          uuid    NOT NULL REFERENCES league_clubs(club_id),
  away_club_id          uuid    NOT NULL REFERENCES league_clubs(club_id),
  kickoff_at            timestamptz NOT NULL,
  original_kickoff_at   timestamptz,
  venue                 text,
  home_goals            integer,
  away_goals            integer,
  status                text    NOT NULL DEFAULT 'scheduled',
  status_detail         text,
  live_minute           integer,
  live_period           text,
  live_added            integer,
  is_completed          boolean NOT NULL DEFAULT false,
  completed_at          timestamptz,
  external_fixture_id   text    NOT NULL,
  last_synced_at        timestamptz,
  result_pushes_sent_at timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_fixtures_season_ext_key  UNIQUE (season_id, external_fixture_id),
  CONSTRAINT league_fixtures_season_num_key  UNIQUE (season_id, fixture_number),
  CONSTRAINT league_fixtures_clubs_ck        CHECK (home_club_id <> away_club_id),
  CONSTRAINT league_fixtures_status_ck       CHECK (status IN ('scheduled','live','completed','postponed','cancelled')),
  CONSTRAINT league_fixtures_result_pair_ck  CHECK ((home_goals IS NULL) = (away_goals IS NULL)),
  CONSTRAINT league_fixtures_completed_ck    CHECK (NOT is_completed OR home_goals IS NOT NULL)
);
CREATE INDEX idx_league_fixtures_mw     ON league_fixtures(matchweek_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_season ON league_fixtures(season_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_open   ON league_fixtures(season_id, kickoff_at) WHERE NOT is_completed;
```

**How a fixture identifies its matchweek: `matchweek_id`, a hard FK — not an integer.** This is the single most important shape decision in the DDL. `matches.round_number INTEGER` (migration 024) makes a matchweek a loose ordinal that any query must re-scope by `tournament_id AND stage`, and `lib/roundMatches.ts:38-40` does exactly that three-predicate dance. An FK makes "the fixtures of matchweek 7" one indexed lookup that cannot accidentally span a season or a phase.

Gone: `stage`, `group_letter`, `home_team_placeholder`, `away_team_placeholder`, `winner_team_id`, `home_score_pso`, `away_score_pso`, `match_number` (season-global; replaced by `fixture_number` scoped to a season), `data_source`.

Two CHECKs are hardening `matches` does not have: `matches` permits `is_completed = true` with NULL scores, and permits one score NULL and the other set.

⚠ **`fixture_number` is display and tiebreak only — it is not chronology.** Two reasons. First, leagues reschedule: a fixture moved from December to April keeps its import-order number. Second, and worse for the World-Cup-shaped assumption, **a league kicks off five or six fixtures simultaneously** (Saturday 15:00). `readSource.ts:331` (`order('match_number', desc).limit(5)`), migration 037's `row_number() over (order by match_number desc)` and `PointsBreakdownModal.tsx:254` all assume a total order. The league's ordering key is therefore the **pair** `(kicked_off_at DESC, fixture_number DESC)`, carried on the score row (§1.6). This is a genuine divergence from the World Cup and I am recommending it deliberately.

### 1.5 `league_predictions`

```sql
CREATE TABLE league_predictions (
  prediction_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             uuid NOT NULL REFERENCES pool_entries(entry_id)     ON DELETE CASCADE,
  fixture_id           uuid NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  predicted_home_score integer NOT NULL,
  predicted_away_score integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_predictions_entry_fixture_key UNIQUE (entry_id, fixture_id),
  CONSTRAINT league_predictions_home_ck CHECK (predicted_home_score BETWEEN 0 AND 20),
  CONSTRAINT league_predictions_away_ck CHECK (predicted_away_score BETWEEN 0 AND 20)
);
CREATE INDEX idx_league_predictions_fixture      ON league_predictions(fixture_id);
CREATE INDEX idx_league_predictions_entry_upd    ON league_predictions(entry_id, updated_at DESC);
```

**How a prediction identifies its fixture and entry:** `UNIQUE (entry_id, fixture_id)`, both hard FKs with `ON DELETE CASCADE` — deliberately the same natural key and the same cascade semantics as `predictions_entry_id_match_id_key` / `predictions_match_id_fkey`, so every counting query in the audit (`lib/auto-submit.ts:103`, `:288`, `predictions/route.ts:57,277,358`, `predictions/round/route.ts:117`, `app/pools/page.tsx:112`, `app/dashboard/page.tsx:317`) is a literal two-token repoint: `predictions`→`league_predictions`, `match_id`→`fixture_id`.

**I am keeping `predicted_home_score` / `predicted_away_score` rather than renaming to `goals`.** The vocabulary problem this project has is `country_name` for a club, `group_letter`, `stage`, `placeholder` — "score" is not part of it. Renaming here would buy nothing and would insert a field-mapping layer into the single hottest read path in the product (`lib/poolData.ts:485`).

Gone: `predicted_home_pso`, `predicted_away_pso`, `predicted_winner_team_id`, `confidence_level` (dead on `predictions` too).

### 1.6 `league_match_scores`

This table exists because of a hard blocker, not a preference: `shadow_match_scores_match_id_fkey` is `FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE`, verified live. A league fixture that is not in `matches` **physically cannot** be inserted there.

```sql
CREATE TABLE league_match_scores (
  entry_id             uuid    NOT NULL REFERENCES pool_entries(entry_id)      ON DELETE CASCADE,
  fixture_id           uuid    NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  pool_id              uuid    NOT NULL REFERENCES pools(pool_id)              ON DELETE CASCADE,
  matchweek_number     integer NOT NULL,
  fixture_number       integer NOT NULL,
  kicked_off_at        timestamptz NOT NULL,
  score_type           text    NOT NULL,
  points               integer NOT NULL,
  predicted_home_score integer NOT NULL,
  predicted_away_score integer NOT NULL,
  actual_home_score    integer NOT NULL,
  actual_away_score    integer NOT NULL,
  calculated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, fixture_id),
  CONSTRAINT league_match_scores_type_ck
    CHECK (score_type IN ('exact','winner_gd','winner','miss'))
);
CREATE INDEX idx_lms_entry_chron ON league_match_scores(entry_id, kicked_off_at DESC, fixture_number DESC);
CREATE INDEX idx_lms_pool_calc   ON league_match_scores(pool_id, calculated_at DESC);
CREATE INDEX idx_lms_fixture     ON league_match_scores(fixture_id);
```

`pool_id` is denormalised because `pool_entries` has no `pool_id` (it reaches a pool via `pool_members`) — the same reason `shadow_match_scores` carries it.

The `score_type` CHECK is **deliberately the identical four-value vocabulary** as `shadow_match_scores_score_type_check`. Every downstream consumer buckets on those strings: `analyticsHelpers.ts:22-32`, `xpSystem.ts:138-145`, `lib/push/badges.ts:402-480`, migration 037. A league cannot invent a fifth outcome without a cross-cutting change, and it does not need one.

Omitted, and **synthesised at the read boundary instead of stored**: `multiplier` (always 1), `pso_points` (always 0), `teams_match` (always true), `predicted_home_team_id` / `predicted_away_team_id` (always NULL), `predicted_*_pso` / `actual_*_pso` (always NULL). Storing four columns of constants on 380 × N rows to satisfy a projection is the World-Cup-furniture mistake in miniature.

### 1.7 `league_entry_totals` — column names are load-bearing

```sql
CREATE TABLE league_entry_totals (
  entry_id            uuid PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  pool_id             uuid    NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  match_points        integer NOT NULL DEFAULT 0,
  bonus_points        integer NOT NULL DEFAULT 0,
  total_points        integer NOT NULL DEFAULT 0,   -- match + bonus + pool_entries.point_adjustment
  final_rank          integer,
  previous_final_rank integer,
  exact_count         integer NOT NULL DEFAULT 0,
  correct_count       integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_let_pool ON league_entry_totals(pool_id);

CREATE TRIGGER broadcast_pool_leaderboard_ins AFTER INSERT ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION broadcast_pool_leaderboard();
CREATE TRIGGER broadcast_pool_leaderboard_upd AFTER UPDATE ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT
  EXECUTE FUNCTION broadcast_pool_leaderboard();
```

The first seven column names are **not a style choice**. They are the exact identifiers `broadcast_pool_leaderboard()` dereferences off its transition table. Match them and the live-leaderboard guarantee is inherited with zero new code; change one and the trigger raises at runtime.

`total_points` must already fold `pool_entries.point_adjustment`, because `readEntryScoring` reconstructs the adjustment as `tp - mp - bp` (`lib/scoring/readSource.ts:147-178`).

`exact_count` / `correct_count` are stored here where `shadow_entry_totals` recomputes them in a CTE — they are the rank tiebreak inputs and storing them makes a rank-only recompute cheap and auditable.

### 1.8 `league_fixture_state` — the reconciler's diff mirror

```sql
CREATE TABLE league_fixture_state (
  fixture_id   uuid PRIMARY KEY REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  home_goals   integer,
  away_goals   integer,
  status       text,
  is_completed boolean,
  scored_at    timestamptz NOT NULL DEFAULT now()
);
```

Exactly `shadow_match_state`'s role: `shadow_reconcile_matches` selects work by diffing `matches` against it. Same pattern, own table.

### 1.9 Not created in v1: `league_bonus_scores`

**Deliberate decision, recorded:** a league pool writes zero bonus rows and `league_entry_totals.bonus_points` is a stored `0`. The reader returns `[]` for `readBonusScores`. Reason: `bonus_category` and `related_group_letter` are bracket vocabulary, and Final Table (Decision 9) is not in v1. Creating an empty table now invites a writer nobody designed. When Final Table lands it gets `league_bonus_scores(entry_id, pool_id, bonus_type, related_matchweek_id, points_earned, description)` with `UNIQUE (entry_id, bonus_type, related_matchweek_id)` — the four-part uniqueness `readSource.ts:274` needs for its synthesised React key.

### 1.10 RLS and triggers

| Object | RLS |
|---|---|
| `league_seasons`, `league_clubs`, `league_matchweeks`, `league_fixtures` | RLS on, one `SELECT USING (true)` policy — mirrors the live `matches` / `teams` policies |
| `league_predictions` | RLS on, four policies transcribed from `predictions` (own-select, admin-select, insert, update) with `predictions.entry_id` → `league_predictions.entry_id`. The `pe.predictions_locked = false AND po.archived_at IS NULL` conditions carry over unchanged |
| `league_match_scores`, `league_entry_totals`, `league_fixture_state` | RLS on, **no policies** — deny-all, service-role only. Mirrors `shadow_match_scores` |

```sql
-- The lock. Silent-skip, mirroring enforce_prediction_before_kickoff, because
-- mobile writes predictions directly and a RAISE surfaces as an opaque failure.
CREATE FUNCTION enforce_league_prediction_before_lock() RETURNS trigger AS $$
DECLARE v_lock timestamptz; v_done boolean;
BEGIN
  SELECT mw.lock_at, f.is_completed INTO v_lock, v_done
  FROM league_fixtures f JOIN league_matchweeks mw ON mw.matchweek_id = f.matchweek_id
  WHERE f.fixture_id = NEW.fixture_id;
  IF v_done IS TRUE THEN RETURN NULL; END IF;
  IF v_lock IS NOT NULL AND v_lock <= now() THEN RETURN NULL; END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- The cross-competition guard. This one RAISES: it is a programming error, not a race.
CREATE FUNCTION assert_league_prediction_pool() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm ON pm.member_id = pe.member_id
      JOIN pools po        ON po.pool_id   = pm.pool_id
      JOIN league_fixtures f ON f.fixture_id = NEW.fixture_id
     WHERE pe.entry_id = NEW.entry_id AND po.league_season_id = f.season_id
  ) THEN
    RAISE EXCEPTION 'league_predictions: entry % is not in a pool playing this fixture''s season', NEW.entry_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- Keeps lock_at honest through reschedules.
CREATE FUNCTION refresh_league_matchweek_window() RETURNS trigger AS $$ ... $$;
-- AFTER INSERT OR UPDATE OF kickoff_at OR DELETE ON league_fixtures, FOR EACH STATEMENT
```

---

## 2. The one touch on `pools`

### The three options, measured

| | Mechanism | Cost against "the World Cup structure is frozen" |
|---|---|---|
| **A. Nullable second FK** | `pools.league_season_id uuid REFERENCES league_seasons`, `tournament_id` loses `NOT NULL`, CHECK enforces exactly-one | One added column, one dropped `NOT NULL`, one CHECK. No data change: all 623 existing rows already satisfy it. FK integrity preserved on both arms. **Risk: `tournament_id` becoming nullable turns ~50 `.eq('tournament_id', pool.tournament_id)` sites into silent-empty for league pools** — `.eq(col, null)` renders `col=eq.null`, which returns zero rows without erroring |
| **B. Polymorphic `(competition_kind, competition_id)`** | Two columns, no FK possible | **Loses referential integrity on both competitions.** `pools_tournament_id_fkey` is dropped, so a deleted tournament orphans pools silently. Also requires rewriting every existing `tournament_id` read even for World Cup pools — the largest possible touch. Reject |
| **C. Bridging table `pool_league_season(pool_id, season_id)`** | `pools` literally untouched | Sounds like zero cost, but `pools.tournament_id` stays `NOT NULL`, so **a league pool must still point at a `tournaments` row.** That row is exactly the World Cup furniture the decision removes, and it re-arms `loadSyncTargets`, `matches_stage_check`, and the unscoped `teams` read. Reject — this is the current mess with an extra join |

### Recommendation: **A**, with the nullability risk closed by the type system, not by discipline

```sql
ALTER TABLE pools
  ADD COLUMN league_season_id uuid REFERENCES league_seasons(season_id);

ALTER TABLE pools ALTER COLUMN tournament_id DROP NOT NULL;

ALTER TABLE pools ADD CONSTRAINT pools_exactly_one_competition CHECK (
  (tournament_id IS NOT NULL AND league_season_id IS NULL) OR
  (tournament_id IS NULL     AND league_season_id IS NOT NULL)
);

CREATE INDEX idx_pools_league_season ON pools(league_season_id) WHERE league_season_id IS NOT NULL;
```

That is the whole touch. `pools_tournament_id_fkey` survives; every World Cup pool's row is byte-identical; `DROP NOT NULL` does not rewrite the table.

**Why this beats a bridging table under the freeze constraint:** the freeze is a promise about *World Cup behaviour*, not about the DDL text of shared tables. `pools` is explicitly in the shared layer. A nullable column that is NULL on all 623 existing rows changes nothing a World Cup pool does. A bridging table that forces a fake `tournaments` row changes what the World Cup's own ingest, stage CHECK and team list see — a bigger hole, wearing a smaller-looking hat.

### The safeguard that makes A safe — and it is the same mechanism as §3

Replace `tournament_id` on the **application-level** pool type with a discriminated union, so the compiler names every reader:

```ts
// lib/competition/ref.ts
export type CompetitionRef =
  | { kind: 'world_cup'; tournamentId: string }
  | { kind: 'league';    seasonId: string }

export function competitionRef(row: { tournament_id: string | null; league_season_id: string | null }): CompetitionRef
```

`PoolData` (`app/pools/[pool_id]/types.ts`) drops `tournament_id` and gains `competition: CompetitionRef`. Every one of the ~50 `pool.tournament_id` reads becomes a **compile error**, and `next.config.ts` already fails the build on type errors. The compiler, not a reviewer, produces the exhaustive list of competition-scoped readers — which is precisely what the audits had to produce by hand.

Explicitly **not** added: no `competition_kind` discriminator column. `pools.prediction_mode = 'league_pickem'` (already in `pools_prediction_mode_check`, verified live) plus the exactly-one CHECK make a third column redundant, and the widened CHECK is a value in an existing column, not a structural touch.

> **Decision needed (D1):** confirm `pools_prediction_mode_check` keeps `'league_pickem'` through the revert. Everything below assumes it does.

---

## 3. Silent-empty mitigation

### 3.1 The class of failure the fork removes for free

With league fixtures in `league_fixtures`, the World Cup scoring engine **cannot see a league fixture at all**:

- `shadow_reconcile_matches` (jobid 19) selects work from `matches LEFT JOIN shadow_match_state`. A league fixture is in neither, so `shadow_score_match` is never invoked with one.
- Consequently the three `FROM predictions` reads inside `shadow_score_match` (`046:147`, `:196`, `:315`) become **unreachable for league data**, not merely empty.
- The cross-engine data-eater at `046:147` — the `DELETE ... NOT EXISTS` arm that would purge a league engine's rows from `shadow_match_scores` — is structurally impossible, because league rows are in `league_match_scores`.
- `trg_shadow_bump_inputs_matches` is `ON public.matches`; a league fixture update never fires it.
- `advance-teams`, `advancementTriggerFor`, `resolvePredictedBracket`, `shadow_entry_bracket` — none can be reached by a fixture that has no `stage`.

That is the single strongest argument for the purpose-built tables, and it should be stated in the migration header: **the fork converts about a dozen silent-empty readers into unreachable code paths.**

### 3.2 The three that the fork does *not* fix — containment predicates

These select pools or entries **globally**, not from `matches`, so they reach league pools regardless.

| Function | What it does to a league pool | Required change |
|---|---|---|
| `shadow_reconcile_adjustments(integer)` — cron jobid 20, every 2 min | Selects a league entry with any `point_adjustment` (`se.entry_id IS NULL AND adjustment <> 0`), calls `shadow_finalize_totals`, which **inserts a zeroed `shadow_entry_totals` row** — firing `broadcast_pool_leaderboard_ins` and pushing zeros onto `pool:{league_pool}:leaderboard`. Live wrong-data push, merged by `liveMerge.ts:65-102` | `AND po.league_season_id IS NULL` in the selector |
| `shadow_finalize_totals(uuid[])` | Its `tmp_ft` is unfiltered when `p_pool_ids IS NULL`. A league entry with `has_submitted_predictions = true` (which `predictions/round/route.ts:166` sets) is swept in, aggregates to zero, and overwrites | `AND po.league_season_id IS NULL` in `tmp_ft`. Belt-and-braces even after the caller above is fixed — it protects every future NULL call, including scripts |
| `shadow_detect_diffs()` — cron jobid 21, parity alarm | Compares `pool_entries` against `shadow_entry_totals`. With the `pool_entries` mirror of §5, a league pool has real numbers on one side and no row on the other → **permanently red alarm**. Memory already records one alarm-fatigue incident (126 mismatched entries after the R20 re-score) | `AND po.league_season_id IS NULL` |

These are **containment predicates, not league arms.** Each is one additive conjunct that is provably false for every World Cup pool. Verification is mechanical: `pg_get_functiondef` diff before/after must show exactly one added line per function, and re-running `shadow_score_match` on one completed World Cup match per stage must produce byte-identical `score_type / base_points / multiplier / total_points`.

> **Decision needed (D2):** these three touches are unavoidable. If the freeze is read as literal, the only alternative is accepting a permanently red parity alarm and a live zero-push. I recommend taking the three predicates.

### 3.3 Left deliberately inert, with justification

| Reader | Why inert is correct |
|---|---|
| `shadow_score_match` × 3 predictions reads (`046:147,196,315`; live body at `drafts/2026-07-17_shadow_phaseA_1_widen_match_scores.sql:62,111,227`) | Unreachable — §3.1 |
| `shadow_entries_needing_rederive` (`032:96`), `shadow_mark_pools_rederived` (`032:152,172`), and the superseded `030:75` / `031:84` | These maintain `shadow_entry_bracket_state`, a *bracket-resolution* watermark. A league has no bracket, so there is nothing to derive and "derived nothing" is the correct outcome. The audit's NULL-watermark trap means each league entry is selected **once** and never again — a bounded one-time cost, not a recurring leak. **Verify empirically** after the first league pool: if the selector returns the same entry twice, add the containment predicate |
| `lib/scoring/shadowBrackets.ts:195` `backfillResolvedBrackets`, `:501` `backfillBonusInputs`, `:636` `reconcileStaleEntries` | All three resolve or materialise **bracket** inputs. `:501`'s purge-then-rewrite (the NasserSEN failure mode) has nothing to purge: a league entry has no `shadow_resolved_*` / `shadow_actual_*` rows and never will |
| `shadow_calculate_bonuses`, `shadow_calculate_bp_bonuses` | Only ever called with pool ids derived from `shadow_match_scores` or from `prediction_mode='bracket_picker'`. A league pool appears in neither |
| `app/api/cron/shadow-materialize` `:82` / `:91` | Watermark detectors over `predictions.updated_at`. **The league needs no equivalent at all** — `enforce_league_prediction_before_lock` makes a post-lock edit impossible, and the lock precedes the matchweek's first kickoff, so a league prediction can never change after its fixture is scored. This is a real simplification and should be recorded as one |
| `lib/scoring/recalculate.ts:244` | `recalculatePool` already early-returns for `league_pickem` (`:96,103-112`). Keep it. It is the enforcement point for "one owner per engine" |
| `lib/poolData.ts:265` `match_conduct` | Only consumed by the group-standings fair-play tiebreaker. The Premier League's tiebreakers are goal difference then goals scored — conduct is genuinely unused. **Skip the query entirely for a league pool** rather than run it and discard |
| `lib/poolData.ts:347` `tournament_awards` | No podium in a league. Skip the query; return `null` |
| `poolData.ts:208` knockout-stripping | Branch out for a league. Note the audit's finding that it survives today only by `[].every() === true` — one league fixture ever carrying `stage='group'` would blank every club name. With no `stage` column, impossible |
| `page.tsx:131,147`, `PoolDetail.tsx:469,528` bracket_picker reads | Already mode-gated. No change |

### 3.4 Repointed at the data boundary

The mechanism is **one adapter, not scattered branches**:

```ts
// lib/predictions/store.ts
export interface PredictionStore {
  countForEntry(entryId: string): Promise<number>
  countForEntryInRound(entryId: string, roundKey: string): Promise<number>
  fetchForEntry(entryId: string): Promise<PredictionRow[]>
  fetchForPool(poolId: string): Promise<PredictionRow[]>       // paged past 1,000
  upsert(entryId: string, rows: PredictionInput[]): Promise<void>
}
export function predictionStore(ref: CompetitionRef): PredictionStore
```

`PredictionRow` is the existing 8-field `PREDICTION_COLUMNS` shape; the league adapter emits `match_id: fixture_id`, `predicted_home_pso: null`, `predicted_away_pso: null`, `predicted_winner_team_id: null`. **Every consumer downstream of the adapter is unchanged.**

| Site | Treatment |
|---|---|
| `lib/auto-submit.ts:103` `autoSubmitDraftEntries` | **Excluded, explicitly.** A league pool has no single pool-wide deadline; `pools.prediction_deadline` is meaningless for it. Today this sweep has no mode filter and silently iterates league pools. Add `.is('league_season_id', null)` to the pool selection and log the count skipped |
| `lib/auto-submit.ts:288` `autoSubmitProgressiveRounds` | **Repointed via adapter**, renamed `autoSubmitRoundEntries`. `fetchRoundMatches` is already matchweek-aware; only `countForEntryInRound` changes. Keeps ONE round state machine, ONE email, ONE push. This is the most dangerous reader in the audit — the `predCount === 0 → continue` at `:293` skips the `entry_round_submissions` write while `:346` still transitions the round to `in_progress`, excluding the entry from scoring entirely with no error |
| `predictions/round/route.ts:117,166,174` | **Repointed.** Also the site that sets `predictions_submitted_at`, the rank tiebreaker |
| `predictions/route.ts:57`, `:277` | **Repointed** |
| `predictions/route.ts:358` PUT all-at-once submit | **Refused loudly.** A league pool must not submit all 380 at once. Return `409 {error: 'league pools submit per matchweek'}` — never the current misleading `Not all matches predicted. 0/380 completed.` |
| `bonus/calculate/route.ts:143` | **Refused loudly (400).** Note `:166` bulk-deletes bonus rows *before* `:181`'s `continue`, so running it is destructive |
| `lib/analytics/entryAnalytics.ts:70-77` (matches), `:112-132`, `:119` (predictions) | **Repointed via adapter + a fixture adapter.** This is the only writer of `entry_xp_state`. Unrepointed, every league member is Level 1 with `hit_rate 0` and `last_five` all `no_pick`, silently, because empty is a valid result |
| `lib/push/badges.ts:384` `predictionCount` | **Repointed.** Gates `lightning_rod` and `stadium_regular` |
| `lib/push/badges.ts:388-391` `pool_entries.current_rank` | **Fixed by the `pool_entries` mirror** (§5). `top_dog` is gated on `current_rank === 1` |
| `app/pools/page.tsx:112`, `app/dashboard/page.tsx:317` | **Repointed.** Otherwise every league pool card reads "Level 1 · 0 of 380 predicted" and sorts as not-started (`DashboardClient.tsx:819-822,857-860`) |
| `entries/[entry_id]/analytics/route.ts:105` | **Repointed** |
| `lib/poolData.ts:485` `getPoolBulkDataUncached` | **Repointed** — the single most expensive statement in the product |
| `page.tsx:76`, `PoolDetail.tsx:436` (browser, RLS client) | **Repointed** + the `league_predictions` RLS policies of §1.10 |
| `page.tsx:87`, `PoolDetail.tsx:452` — gated on `=== 'progressive'` | **Repointed to `usesRounds(mode)`** (`lib/competitionRounds.ts:221`, already exists). Left alone, a league pool gets `roundStates=[]` and every matchweek reads "locked" |
| `page.tsx:98` lazy seed of seven World Cup round keys | **Deleted.** `lib/poolRoundStates.ts:seedPoolRoundStates` is already format-aware and mid-season-aware; the lazy seed is a landmine that would write `group/round_32/…` into a league pool |
| `pool_match_prediction_accuracy(uuid, boolean)` (migration 039) | **League arm inside the same function** — a `UNION ALL` over `league_predictions JOIN league_fixtures`, gated on the pool's `league_season_id`. Signature unchanged, so `lib/poolData.ts:327` and the Form-tab caller need no edit |
| `entry_match_score_summary(uuid[], text)` (migration 037) | **Third `p_source` arm, `'league'`**, ordering by `kicked_off_at DESC, fixture_number DESC` instead of `match_number DESC`. Otherwise the RN home screen is blank for league entries |
| `lib/scoring/readSource.ts:83` `getScoringSource` | **Third return value `'league'`**, keyed on `pool.league_season_id IS NOT NULL` — not on the mode. Format-driven, so there is no allowlist to forget |
| `readSource.ts:221` `readMatchScores` and the four narrower readers (`:320`, `:360`, `:398`, `:423`) | **League arm** reading `league_match_scores` and synthesising the omitted constants |
| `lib/poolData.ts:182` (teams), `:199` (fixtures), `:302` (matchday MVP) | **Repointed** to `league_clubs` / `league_fixtures`, mapped into the existing `TeamData` / `MatchData` shapes. MVP's "last completed by `max(match_number)`" becomes "last completed by `(kicked_off_at, fixture_number)`" |

### 3.5 The mechanical safeguard — three layers, in order of strength

**Layer 1 — the compiler (prevention).** The `CompetitionRef` discriminated union of §2 removes `tournament_id` from `PoolData`. Every competition-scoped reader becomes a build failure. `next.config.ts` already fails the build on type errors, so this is enforced, not advisory. Pair it with an ESLint `no-restricted-syntax` rule: `.from('predictions')` and `.from('matches')` may appear only inside `lib/predictions/`, `lib/fixtures/` and `lib/scoring/`.

**Layer 2 — the database (detection at the write).** `trg_predictions_reject_league_pool`:

```sql
CREATE FUNCTION reject_league_pool_prediction() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pool_entries pe
               JOIN pool_members pm ON pm.member_id = pe.member_id
               JOIN pools po        ON po.pool_id   = pm.pool_id
              WHERE pe.entry_id = NEW.entry_id AND po.league_season_id IS NOT NULL) THEN
    RAISE EXCEPTION 'predictions: entry % belongs to a league pool — use league_predictions', NEW.entry_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

This converts *every* missed writer — including ones nobody enumerated, including mobile, including a future script — from silent-zero into an error at the exact line. It is a second touch on a World Cup table's triggers, and it is provably a no-op for all 623 existing pools because the predicate is false for every one.

> **Decision needed (D3):** accept this trigger as a deliberate second touch, or rely on Layer 1 + Layer 3 alone. I recommend taking it. The failure it prevents is the exact one the whole audit is about.

**Layer 3 — the outcome (detection at rest).** A `league_scoring_health` view plus a cron alarm on the same channel as `shadow_detect_diffs`. It checks **results, not code paths**, which is why it catches readers nobody thought of:

```sql
CREATE VIEW league_scoring_health AS
SELECT p.pool_id, p.pool_name,
       f.completed_fixtures,
       s.scored_rows,
       t.totals_rows,
       x.xp_rows,
       e.eligible_entries
FROM pools p
JOIN LATERAL (SELECT count(*) completed_fixtures FROM league_fixtures lf
               WHERE lf.season_id = p.league_season_id AND lf.is_completed) f ON true
JOIN LATERAL (SELECT count(*) scored_rows FROM league_match_scores lms WHERE lms.pool_id = p.pool_id) s ON true
JOIN LATERAL (SELECT count(*) totals_rows FROM league_entry_totals let WHERE let.pool_id = p.pool_id) t ON true
JOIN LATERAL (...) x ON true
JOIN LATERAL (...) e ON true
WHERE p.league_season_id IS NOT NULL;
```

Alarm rule: **`completed_fixtures > 0` and `eligible_entries > 0` implies `scored_rows > 0` and `totals_rows = eligible_entries` and `xp_rows = eligible_entries`.** This is the CI-assertable, production-observable version of *"a league pool that scores zero must be impossible to ship unnoticed"*, applied one stage later than the importer's ordinal guard. Run it as a Vitest fixture against a synthetic pool in CI **and** as a cron alarm in production.

---

## 4. How the existing UI is reused

The goal is maximum reuse. Almost everything reuses, because the reuse boundary is `MatchData` / `TeamData` / `PredictionData` / `EntryScoring` — types, not tables. Repoint the loaders and the components never know.

### 4.1 Repointed at the data boundary — zero component change

| Consumer | How |
|---|---|
| `lib/poolData.ts:182` team list → `TeamData[]` | `league_clubs` mapped: `name → country_name`, `abbreviation → country_code`, `crest_url → flag_url`, `group_letter: null`, `fifa_ranking_points: null`. Ordered by `name`. **The `{country_name, country_code, flag_url}` shape that `PoolDetail.tsx:989` calls "the single most pervasive club-vs-country mismatch" stays** — deliberately. Renaming it touches every prediction flow, every match card and every share-card for zero user-visible benefit. It is a wart on the *type*, not on the screen. Fix it when a third sport forces it |
| `lib/poolData.ts:199` fixtures → `MatchData[]` | `league_fixtures` + two `league_clubs` joins. `fixture_number → match_number`, `matchweek_number → round_number`, `kickoff_at → match_date`, `home_goals → home_score_ft`, `stage: 'regular_season'` synthesised at the boundary (**not stored**), `group_letter/placeholders/pso: null`. Ordered `kickoff_at, fixture_number` |
| `PoolDetail.tsx:297,662,691` (`/match-scores`, `/bulk`, `/live`) | Route internals repoint; the client fetch and `liveMerge.ts` are untouched |
| `PoolDetail.tsx:769-782` realtime leaderboard subscription | **Untouched** — same topic, same payload, courtesy of the reused trigger function |
| `LeaderboardTab`, `MembersTab`, `PointsBreakdownModal`, `CommunityTab`/Banter, `AnalyticsTab`/Form, `PoolInfoTab` | **Untouched.** They read `EntryScoring`, `entry_xp_state` and `MatchScoreData`, all of which the league produces in the existing shapes |
| `app/api/pools/[pool_id]/leaderboard/route.ts`, `.../live/route.ts` | Internals repoint (`:92-100` competition-scoped reads); response contracts unchanged |
| `ProgressivePredictionsFlow`, `RoundStatusCard`, `GroupStageForm` (the per-fixture score inputs) | **Untouched.** The round model in `lib/competitionRounds.ts` is already format-aware and unit-tested (23 tests); `mw_7` is already a valid `round_key` (TEXT, `UNIQUE (pool_id, round_key)`) |
| `EveryoneElseSection`, `EntriesListView`, `SpectatorEntryView` | Untouched once `pool_entries` is mirrored (§5) |

### 4.2 Small branch inside an existing component

| Consumer | Branch |
|---|---|
| `results/ResultsView.tsx:29` `STAGE_TABS` | Make the tab list a **prop** rather than a module constant. Bracket pools pass the existing seven; a league pool passes `All Matchweeks` + the matchweeks that have a fixture (derived, not hardcoded — 34/38/46 varies by league). Same dropdown, same styling |
| `results/ResultsView.tsx:103` filter logic | `roundFilter` on `round_number` instead of `stage` equality. One `if` |
| `results/ResultsView.tsx:238` `GROUP_LETTERS` A–L strip | Hidden for a league (`groupFilter` is bracket-only). The `hasGroupResults` test at `:150` already tests `stage === 'group'`, so it is correct by accident today; make it explicit |
| `ResultsTab.tsx:157,184` `resolvePredictedBracket` / `knockoutTeamMap` | Skip for a league — `knockoutTeamMap = {}`. Today it runs `resolvePredictedBracket` over 380 fixtures and returns nothing: wasted work whose annotation silently disappears |
| `PoolDetail.tsx` tab list | `USER_TABS_DEFAULT` minus nothing, plus `standings` (currently commented out at `:109`) re-enabled for league pools |
| `ScoringRulesTab`, `HowToPlayTab`, `lib/poolModeInfo.ts` | New copy for `league_pickem`. The `PredictionMode` union at `poolModeInfo.ts:14` widens; ~40 inline re-declarations of that union become compiler-named edits |
| `PointsBreakdownModal` | Suppress the `×N multiplier` row when the multiplier is 1. Cosmetic |

### 4.3 Genuinely new UI — two components

1. **`LeagueTable`** — the 20-row standings table (P, W, D, L, GF, GA, GD, Pts), derived from `league_fixtures` in SQL. `StandingsTab.tsx` and `components/predictions/StandingsTable.tsx` exist and are group-shaped; the row model is close enough that this is a fork of ~150 lines, not a new subsystem. It replaces `GroupStandingsComparison` in the slot at `ResultsView.tsx:258`.
2. **`MatchweekPicker`** — the 38-cell matchweek strip that replaces the A–L group strip. Small.

Everything else — leaderboard, Banter, Form, XP, badges, members, breakdown, share-cards, the live merge — reuses unchanged.

---

## 5. The scoring engine

### 5.1 Where it lives: SQL only

The project rule is *"backend computes once and stores; frontends only display; aggregates in SQL"* (`project_scoring_architecture_rule`), and the July plan's anti-fork warning is specific: writing the league engine in Node **and** in SQL would recreate the hand-fork that made prod↔shadow parity worthless.

`lib/scoring/recalculate.ts:96,103-112` already refuses to score league pools and is the enforcement point. **Keep it, and re-key it from `prediction_mode === 'league_pickem'` to `pool.league_season_id !== null`** — the competition, not the mode, is what determines which engine owns a pool.

Two functions, mirroring the shadow pair:

### 5.2 `league_score_fixture(p_fixture_id uuid, p_final boolean)`

**What `calculateLeague` computes**, per `(entry, fixture)`:

- **Eligibility:** the entry's pool has `league_season_id = fixture.season_id`; the entry has an `entry_round_submissions` row with `has_submitted` for the fixture's matchweek key (`mw_{n}`); the fixture has both goals; `is_completed OR (NOT p_final AND status='live')`.
  > Note this uses `entry_round_submissions` **only** — not `pool_entries.has_submitted_predictions`, and not `mode_submits_per_round`. A league is per-matchweek by construction, so the World Cup's dual gate does not apply and the reverted `mode_submits_per_round` predicate is not needed.
- **`score_type`:** exact → both goals right; `winner_gd` → right outcome and right goal difference; `winner` → right outcome; else `miss`. **No `teams_match` gate** — a league fixture names its own teams, so there is nothing to verify. This is the whole content of the bug that made a league pool score zero.
- **`points`:** the flat base from `pool_settings.group_exact_score / group_correct_difference / group_correct_result` (canonical 100/75/50), `COALESCE`d to `5/3/1`. **No multiplier, no PSO.** Reusing the `group_*` triple keeps league pools on Decision 6's canonical prices with no new settings columns, and keeps them comparable across pools — a stated Showdown prerequisite. The `group_*` naming on a competition with no groups is a smell; renaming to `base_*` is a sport-#3 job.
- **Writes:** diff-aware upsert into `league_match_scores` (`ON CONFLICT (entry_id, fixture_id) DO UPDATE … WHERE … IS DISTINCT FROM` over `score_type, points, actual_home_score, actual_away_score`). Diff-awareness matters less here than on totals, but the same discipline keeps re-scores cheap.

> **Decision needed (D4):** `group_*` as the flat tier, versus adding `pool_settings.league_exact / league_gd / league_result`. I recommend reuse — new columns mean a new admin surface, a new default, and a new way for two pools to be incomparable.

### 5.3 `league_finalize_totals(p_pool_ids uuid[])`

- Aggregates `league_match_scores` per entry → `match_points`, `exact_count`, `correct_count` (non-miss).
- `bonus_points = 0` (v1, §1.9).
- `total_points = match_points + bonus_points + pool_entries.point_adjustment` — **the adjustment must be folded here**, because `readEntryScoring` reconstructs it as `tp - mp - bp`.
- **Rank:** the canonical cascade, unchanged and correct for a league as-is:
  `RANK() OVER (PARTITION BY pool_id ORDER BY total_points DESC, exact_count DESC, correct_count DESC, bonus_points DESC, predictions_submitted_at ASC NULLS LAST)`.
  `final_rank` is a *stored* value and the parity alarm compares totals only, so rank must be right at write time.
- **Writes** to `league_entry_totals`, diff-aware (`WHERE match_points/bonus_points/total_points/final_rank IS DISTINCT FROM EXCLUDED`). Diff-awareness is load-bearing: the broadcast trigger uses the statement's `NEW` transition table, and `PoolDetail.tsx:754` explicitly depends on unchanged rows never reaching it.
- **Then mirrors** into `pool_entries.{match_points, bonus_points, scored_total_points, current_rank}` in the same transaction.

> **Decision needed (D5): mirror into `pool_entries`, or route the ten direct readers through `readSource`?**
> I recommend **mirroring.** The ten readers are `mobile/lib/usePoolEntries.ts:64`, `usePredictions.ts:77`, `useBracketPickerPredictions.ts:82`, `useMemberRoster.ts:58`, `useMemberDetail.ts:60`, `useHomeData.ts:218`, `app/play/sargasso-sea/getLeaderboard.ts:54`, `components/predictions/EveryoneElseSection.tsx:37`, `app/pools/[pool_id]/admin/MembersTab.tsx:175`, and `lib/push/badges.ts:388-391`. Six are in the Expo app and would need an OTA. `pool_entries` is explicitly in the shared layer; `recalculatePool` early-returns for league pools, so **there is no second writer**; and it makes `top_dog` (gated on `current_rank === 1`) fire correctly with zero code. Cost: one denormalised mirror, guarded by the containment predicate on `shadow_detect_diffs`.

### 5.4 Reaching the leaderboard without forking it

Four seams, all reuse:

1. **Realtime push** — `broadcast_pool_leaderboard()` attached verbatim to `league_entry_totals` (§1.7). Same topic `pool:{id}:leaderboard`, same payload keys, same client subscription, same `liveMerge.ts`. **Nothing on the client changes.**
2. **Server read** — `readEntryScoring` gains a third source arm. One function, one branch, and every one of its eight consumers (`leaderboard/route.ts:133`, `live/route.ts:150`, `poolData.ts:247`, `breakdown/route.ts:186`, `analytics/route.ts:193`, `play/[slug]/getLeaderboard.ts`, `entryAnalytics.ts:95`) is untouched.
3. **Direct `pool_entries` readers** — covered by the mirror.
4. **XP / badges / analytics** — `league_reconcile_fixtures` fires `computePoolEntryAnalytics` and `detectAndPushBadgesForPool` for the affected pools, exactly as `recalculatePool:104-109` already does. Both run through the §3.4 adapter. Without this, `leaderboard/route.ts:201-202` gates `matchPoints`/`bonusPoints` on the `entry_xp_state` row existing — so a league pool would show a correct total with a **zero match/bonus split**.

### 5.5 The drain

```
cron league-reconcile  (* * * * *)   SELECT public.league_reconcile_fixtures();
cron league-snapshot   (* * * * *)   SELECT public.league_snapshot_ranks();
```

`league_reconcile_fixtures()` mirrors `shadow_reconcile_matches` exactly: advisory lock on a **distinct** key (`league_process_queue`, not `shadow_process_queue` — the two engines must not serialise against each other), diff `league_fixtures` against `league_fixture_state`, `league_score_fixture` each, `league_finalize_totals(affected pools)`, upsert the state mirror.

`league_snapshot_ranks()` copies `final_rank → previous_final_rank` when **a matchweek's first fixture goes live** — the league analogue of the World Cup "set match live" path that drives `shadow_snapshot_ranks`. Without it the ▲/▼ movement indicator and the Biggest Climber / Biggest Faller superlatives (`leaderboard/route.ts:294-298`) read zero forever.

Sync: the fixtures cron gains a league arm. `lib/integrations/apiFootball/syncTargets.ts` already loops competitions; a target whose `format = 'league'` writes into `league_fixtures` via a `leagueFixtureToUpdate` mapper instead of `fixtureToMatchUpdate`. `advancementTriggerFor` is never consulted, because a league fixture has no stage to consult it with.

---

## 6. Phased build order

Ordering is dependency order. Every phase has a verification step and a stated rollback.

**L0 — Revert and close the door.**
Execute the revert inventory in its stated order (delete 380 `matches` rows → 20 `teams` rows → the `tournaments` row → the four shadow functions by targeted textual revert, **not** from `drafts/2026-08-14_pre046_shadow_rollback.sql` as-is → `enforce_prediction_before_kickoff` from `045:179-193` **before** dropping `matches.round_number` → the CHECKs → the columns). Capture `shadow_calculate_bonuses`'s current body to a draft file first — it is the one league change with no rollback artifact anywhere in the repo. Set `app/competitions.ts` Premier League to `'upcoming'` / "Coming soon" and revert the wizard's fourth mode card.
*Verify:* `pg_get_functiondef` on all five functions matches the pre-046 text except the deliberate 046d single-base keep; re-score one completed World Cup match per stage and assert byte-identical `score_type / base_points / multiplier / total_points`; `select count(*) from matches where stage='regular_season'` = 0.
*Reversible:* fully — the importer is idempotent by `external_match_id` and re-pulls the season in one command.

**L1 — DDL + importer retarget.**
Create the eight tables, RLS, and the four league triggers. Retarget `importLeagueSeason.ts` at them: clubs → `league_clubs`, phases → `league_matchweeks` (the `UNIQUE (season_id, provider_round)` now enforces what the procedural collision guard at `:365-385` checks), fixtures → `league_fixtures`.
*Verify:* 1 season, 20 clubs, 38 matchweeks, 380 fixtures; `select count(*) from league_fixtures group by matchweek_id` = 10 for all 38; every `lock_at` equals its matchweek's `min(kickoff_at)`; `matches` and `teams` row counts unchanged from L0.
*Reversible:* `DROP TABLE` — nothing else references these yet.

**L2 — Sync arm.**
League branch in `app/api/cron/sync-fixtures` writing `league_fixtures` + the matchweek-window trigger.
*Verify:* a replayed feed payload moves a fixture's kickoff and `league_matchweeks.lock_at` follows; a completed fixture writes goals and `is_completed`; the World Cup's sync run notes are unchanged and still emit no `env fallback in use`.
*Reversible:* remove the branch; the league season goes stale, nothing else.

**L3 — The `pools` touch + `CompetitionRef`.**
`league_season_id`, `DROP NOT NULL`, the CHECK, and the discriminated union on `PoolData`. Fix every compile error the union produces.
*Verify:* `npm run build` clean (which enforces lint + types); a World Cup pool's `/api/pools/:id/leaderboard` and `/live` responses are byte-identical to a pre-change capture; `select count(*) from pools where league_season_id is not null` = 0.
*Reversible:* the DDL yes (`DROP COLUMN`, restore `NOT NULL`); the type sweep is a revert commit. **This is the last fully-cheap-to-revert phase.**

**L4 — Prediction write path.**
`league_predictions` write routes, the adapter (`lib/predictions/store.ts`), the lock trigger, the pool-guard trigger, and Layer 2's `reject_league_pool_prediction`.
*Verify:* a league pick saves and reads back; a pick written after `lock_at` is silently skipped (row count 0 changed, exactly as the World Cup trigger was verified in Phase 0); a `predictions` insert for a league entry **raises**; a `league_predictions` insert for a World Cup entry **raises**; and the `predictions` trigger is a no-op on a real World Cup write.
*Reversible:* yes, but from here a league pool may hold member data — reverting means exporting picks first.

**L5 — Scoring.**
`league_score_fixture`, `league_finalize_totals`, `league_reconcile_fixtures`, `league_snapshot_ranks`, the two broadcast triggers, the two crons, and the **three containment predicates** of §3.2.
*Verify:* a synthetic matchweek (10 fixtures, ≥3 entries, hand-computed expected points) run end to end — assert every one of the fifteen required outputs from the scoring audit is populated and correct, `final_rank` matches a hand-applied tiebreak cascade, the diff-aware upsert produces **zero** broadcast on an unchanged re-run, and `league_scoring_health` is green. Separately: `pg_get_functiondef` diff on the three contained functions shows exactly one added conjunct each, and the World Cup re-score check from L0 still passes.
*Reversible:* drop the crons (scoring stops, data intact); the containment predicates revert by re-running the pre-046 bodies.

**L6 — Read path.**
`getScoringSource` third value, `readMatchScores` + four narrow readers, `poolData.ts` league branches, `entry_match_score_summary` third arm, `pool_match_prediction_accuracy` league arm.
*Verify:* a league variant of `scripts/verify-read-paths.ts`; the World Cup arm of both SQL functions returns identical rows to a pre-change capture; `readMatchScores`'s league arm emits all 22 keys with the correct synthesised constants.
*Reversible:* yes — code only.

**L7 — Analytics, XP, badges.**
Adapter wiring into `entryAnalytics.ts` and `badges.ts`; the `pool_entries` mirror.
*Verify:* after the synthetic matchweek, every eligible entry has an `entry_xp_state` row with `total_completed = 10`, a non-zero `hit_rate`, `last_five` populated, `current_level > 1` where earned; `pool_entries.scored_total_points` equals `league_entry_totals.total_points` for every entry; `shadow_detect_diffs()` returns clean.
*Reversible:* yes.

**L8 — UI.**
Matchweek tabs, `LeagueTable`, `MatchweekPicker`, mode copy, the `page.tsx:98` lazy-seed deletion, the `usesRounds` repoints.
*Verify:* in a browser, on a real league pool with a scored matchweek — leaderboard, Banter, Form, Results, Predictions, Pool Info. Memory's standing lesson applies: a green build is not verification.
*Reversible:* yes.

**L9 — Open the door.**
`league_scoring_health` cron alarm live; wizard league option; `app/competitions.ts` → `'open'`.
*Verify:* create a real pool, invite two people, submit a matchweek, watch a live fixture move the leaderboard without a page refresh.
*Reversible:* flip `app/competitions.ts` and the wizard — one deploy, exactly as §6 of the structure plan already proposes.

---

## Open decisions, named

| # | Decision | My recommendation |
|---|---|---|
| **D1** | Does `pools_prediction_mode_check` keep `'league_pickem'` through the revert? | Keep it — it is a value in a shared column, not World Cup structure |
| **D2** | Three containment predicates on `shadow_reconcile_adjustments`, `shadow_finalize_totals`, `shadow_detect_diffs` | Take them. The alternative is a live zero-push onto a league leaderboard and a permanently red parity alarm |
| **D3** | `reject_league_pool_prediction` trigger on the `predictions` table | Take it. It is the mechanism that makes a missed writer loud, and it is provably a no-op for all 623 existing pools |
| **D4** | `pool_settings.group_*` as the flat league tier, vs new `league_*` price columns | Reuse `group_*`. New columns mean a new admin surface and a new way for pools to be incomparable |
| **D5** | Mirror totals into `pool_entries`, vs routing ten direct readers (six in mobile) through `readSource` | Mirror. No second writer exists, and it makes `top_dog` work with zero code |
| **D6** | No `league_bonus_scores` in v1 | Confirm. Create it with Final Table |
| **D7** | Lock trigger: silent-skip (World Cup behaviour) or `RAISE` | Silent-skip, for consistency with `enforce_prediction_before_kickoff` and because mobile writes directly. Flagging the trade-off: a silent-skip is itself a silent-empty, and the UI must show the matchweek as locked before a member can hit it |

**Where I am least certain:** whether `shadow_entries_needing_rederive` truly selects a league entry only once. The audit's NULL-watermark analysis says yes and I could not falsify it from the function body, but it depends on `shadow_entry_bracket_state`'s insert path, which I did not read. Verify empirically after the first league pool exists; if it recurs, add a fourth containment predicate.

**The one thing I would not compromise on:** `league_fixtures.matchweek_id` as an FK rather than an integer, and `(kicked_off_at, fixture_number)` rather than a single dense ordinal as the chronology. Those two are the places where the World Cup's shape is quietly wrong for a league, and they are far cheaper to get right now than to retrofit once a season's picks are stored against them.

---

# R. Adversarial review findings

Three independent lenses. Reproduced in full, unedited — including the parts that contradict the design above.

## R.wc-safety — verdict: **sound-with-fixes**

The architecture leaves World Cup DATA untouched and is a real improvement on the bolt-on: purpose-built tables make about a dozen silent-empty readers unreachable rather than merely empty, and the leaderboard/realtime reuse via broadcast_pool_leaderboard() is verified sound — the function reads only its transition table and calls realtime.send, so attaching it to league_entry_totals forks nothing. The revert is also data-safe on the member dimension: 0 league pools, 0 league predictions, 0 mw_* round states, and sync-fixtures only UPDATEs matches rows it already finds, so deleting the 380 fixtures is durable. But the plan as written does NOT leave the World Cup untouched. Four issues are load-bearing. (1) Re-keying recalculate.ts's league guard to pool.league_season_id — a column the pool query does not select — makes `undefined !== null` true for every pool and silently disables live prod scoring for all 623 World Cup pools. (2) L0 reverts three of the four shadow functions carrying league arms; shadow_calculate_bonuses is left changed, and because pg_depend records zero dependencies on mode_submits_per_round, dropping the predicate afterwards succeeds silently and then breaks World Cup bonus scoring inside a per-minute cron. (3) The rollback file restores two-base knockout pricing that the live single-base function and the already-completed 104-match re-score have superseded — I confirmed zero of 78,264 stored knockout rows would change under the live function, so restoring the file's pricing hunk would silently rewrite ~597 pools on the next re-score. (4) L0's own verification step re-scores completed World Cup matches, which is a write that fires the leaderboard broadcast, not a check. Separately, the shadow_detect_diffs containment predicate is justified by a misreading (its mismatch insert is an INNER join from shadow_entry_totals, so absence cannot produce a diff), and shadow_eligible_entries — one of the four functions 046 modified — is missing from the containment set entirely, leaving league entries flowing into World Cup bracket state. All eleven findings have concrete, small fixes; none require rethinking the fork.

### [CRITICAL] §5.1 says to re-key the league guard in lib/scoring/recalculate.ts:96 from `pool.prediction_mode === 'league_pickem'` to `pool.league_season_id !== null`. The pool row is fetched at lib/scoring/recalculate.ts:74-77 with `.select('pool_id, tournament_id, prediction_mode')` — league_season_id is not in it. `undefined !== null` is `true` in TS/JS, so isLeaguePool becomes true for every pool.

**Failure.** All 623 World Cup pools take the early-return at recalculate.ts:103-112. recalculatePool stops writing match_scores and bonus_scores entirely — for settings changes, admin point adjustments, bonus recalcs and the /bonus/calculate route. It returns `success: true, entriesProcessed: 0`, so nothing errors and nothing logs. `prod_scoring_enabled` is `true` in production sync_settings (verified live), so this is the live prod engine, not a dormant path.

**Fix.** Do not re-key on a column the query doesn't select. Either keep the mode key, or write `const isLeaguePool = pool.prediction_mode === 'league_pickem' || pool.league_season_id != null` AND add `league_season_id` to the select at :76. Loose `!=` (not `!==`) so an absent column can't flip the branch.

### [CRITICAL] L0 reverts "the four shadow functions" but the only rollback artifact (drafts/2026-08-14_pre046_shadow_rollback.sql) covers three. I verified live: FOUR functions reference `mode_submits_per_round` — shadow_score_match (3 occurrences), shadow_eligible_entries (1), shadow_finalize_totals (1), and shadow_calculate_bonuses (1, added by 046e). The design says only "capture shadow_calculate_bonuses's current body to a draft file first", which snapshots the *changed* state rather than reverting it. Migration 046's own down-migration note (lib/migrations/046_league_scoring.sql:476-478) then says the predicates "can be dropped afterwards".

**Failure.** `SELECT count(*) FROM pg_depend WHERE refobjid = 'mode_submits_per_round(text)'::regprocedure` returns 0 — Postgres records no dependency for plpgsql/sql function-body references. So `DROP FUNCTION public.mode_submits_per_round(text)` succeeds with no error, and from the next minute every shadow_calculate_bonuses call raises `function mode_submits_per_round(text) does not exist` inside cron jobid 19 (shadow_reconcile_matches, `* * * * *`) and jobid 20, aborting the whole reconcile transaction. World Cup bonus scoring and the reconcile drain both stop.

**Fix.** Add shadow_calculate_bonuses to L0's revert list explicitly: the inverse of 046e is a single-token substitution at exactly one site — `mode_submits_per_round(po.prediction_mode)` → `po.prediction_mode = 'progressive'`. Apply it before dropping any predicate. Alternatively state in the plan that `mode_submits_per_round` and `stage_has_scheduled_teams` are KEPT permanently and never dropped.

### [HIGH] L0 says revert the shadow functions "by targeted textual revert, not from drafts/2026-08-14_pre046_shadow_rollback.sql as-is", but does not say which hunk is poison — while that file's own header (line 16) reads "To roll back: run this whole file." The poison hunk is the pricing CASE at drafts/2026-08-14_pre046_shadow_rollback.sql:71-76, which restores `CASE WHEN m.stage='group' THEN group_* ELSE knockout_* END`. Live shadow_score_match uses single-base `COALESCE(ps.group_exact_score,5)` for every stage (046d).

**Failure.** I checked all 78,264 knockout rows in shadow_match_scores against the live single-base pricing: ZERO would change — the full 104-match re-score (commit 784e9ff) already migrated stored World Cup data onto single-base. Restoring the pre-046 two-base body means the next re-score of any completed World Cup knockout match reverts those rows to the double-counted price. Migration 046 measured that only 26 of 623 pools have group_exact_score = knockout_exact_score, so ~597 pools' knockout points would silently change, and the shadow_entry_totals upsert would broadcast the change to live clients.

**Fix.** Annotate lines 71-76 of the rollback file with a ⚠ DO-NOT-RESTORE marker and correct its header. In L0, spell out that the only reverts to shadow_score_match are `mode_submits_per_round(po.prediction_mode)` → `po.prediction_mode = 'progressive'` (3 sites) and `stage_has_scheduled_teams(stage)` → `stage = 'group'` (3 sites); the base-price expression stays exactly as live.

### [HIGH] L0's verification step is "re-score one completed World Cup match per stage and assert byte-identical score_type / base_points / multiplier / total_points". shadow_score_match is not a read: it DELETEs from shadow_match_scores, UPSERTs into it, then UPSERTs shadow_entry_totals — which has broadcast_pool_leaderboard_ins and broadcast_pool_leaderboard_upd attached (verified live).

**Failure.** The verification step is itself the destructive act it is meant to guard against. Run it after a mis-executed revert of the pricing hunk (finding 3) and you have already rewritten real members' knockout scores across ~597 completed pools and pushed the new numbers onto `pool:{id}:leaderboard`, before the assertion tells you anything. There is no dry-run flag on shadow_score_match.

**Fix.** Make the L0 check a SELECT. Recompute expected values in a read-only CTE over shadow_match_scores joined to matches and pool_settings and diff against the stored columns — no write, no trigger, no broadcast. If a live re-score is genuinely wanted afterwards, wrap it in BEGIN … ROLLBACK.

### [HIGH] D2's third containment predicate (shadow_detect_diffs) is justified by a misreading of the live function. The design says a league pool gives "real numbers on one side and no row on the other → permanently red alarm". The live body's mismatch insert is `FROM shadow_entry_totals s JOIN pool_entries pe ON pe.entry_id = s.entry_id` — an INNER join originating at shadow_entry_totals. A league entry with no shadow row cannot appear in `true_errors` at all.

**Failure.** Two consequences. (a) Someone verifies the claim, cannot reproduce a red alarm, and drops the predicate — losing coverage of the path that IS real: a league entry acquiring a shadow_entry_totals row via shadow_reconcile_adjustments' second arm (`se.entry_id IS NULL AND COALESCE(pe.point_adjustment,0) <> 0`), after which the D5 pool_entries mirror genuinely mismatches. (b) The predicate as specified only patches the mismatch insert, leaving the `coverage` rollup — which does LEFT JOIN over all pool_entries grouped by prediction_mode — reporting `league_pickem: {live: N, shadow: 0}` forever, i.e. exactly the alarm-fatigue outcome the design wanted to avoid.

**Fix.** Correct the justification, and apply `AND po.league_season_id IS NULL` to BOTH the mismatch insert and the coverage subquery inside shadow_detect_diffs. State that the reachable trigger is the point_adjustment path, not row absence.

### [MEDIUM] shadow_eligible_entries is one of the four functions 046 gave a league arm, but it appears nowhere in §3.2's containment set. After L0 reverts `mode_submits_per_round` out of it, a league entry is STILL selected — because the first arm is `pe.has_submitted_predictions`, and the design's own §3.2 notes that app/api/pools/[pool_id]/predictions/round/route.ts:166 sets that flag on league entries.

**Failure.** Every league entry flows into shadow_entries_needing_rederive → shadow_mark_pools_rederived, which INSERTs a row into shadow_entry_bracket_state — a frozen World Cup table now holding league rows. I traced the recurrence question the design flagged as its least-certain point: it is bounded (v_skipped requires `EXISTS (SELECT 1 FROM predictions pr WHERE pr.entry_id = e.entry_id)`, false for a league entry, so the entry is marked; predictions_watermark writes NULL and `NULL IS DISTINCT FROM NULL` is false thereafter). So it is one row per entry, not a loop — but it is still league data written into World Cup scoring state by World Cup machinery, which is the category the freeze exists to prevent.

**Fix.** Add `AND po.league_season_id IS NULL` to shadow_eligible_entries as a fourth containment predicate. One conjunct, provably true for all 623 existing pools, and it closes the entire bracket-materialisation pipeline as a class instead of relying on each downstream function being inert.

### [MEDIUM] §3.4 puts league branches inside two live World Cup SQL functions: `pool_match_prediction_accuracy(uuid, boolean)` gains a UNION ALL arm over league_predictions JOIN league_fixtures, and `entry_match_score_summary(uuid[], text)` (migration 037) gains a third p_source arm. pool_match_prediction_accuracy is called on every pool page load (lib/poolData.ts:327); entry_match_score_summary is the RN home screen's read path.

**Failure.** 'Shared function gains a branch' is precisely the freeze category. A UNION ALL arm is planned even when it returns nothing, so the World Cup's hottest per-page RPC now carries a second scan node whose cost is not zero and whose statistics are unrelated to World Cup data. More importantly, any future edit to the league arm is an edit to a function 623 live pools call — the exact coupling the fork was meant to sever.

**Fix.** Create `league_match_prediction_accuracy(uuid)` and a separate league summary function, and dispatch in TypeScript at the single call site each. The caller already knows the competition from CompetitionRef, so the branch costs one `if` in Node and leaves both World Cup function bodies byte-identical.

### [MEDIUM] D3's reject_league_pool_prediction trigger on `predictions` does not fire where the design assumes. BEFORE ROW triggers fire in name order; the live trigger is `trg_enforce_prediction_before_kickoff` (verified), which sorts before `trg_predictions_reject_league_pool`. All 104 World Cup matches are is_completed = true (verified), so enforce_prediction_before_kickoff returns NULL on every World Cup prediction write and the reject trigger is never reached.

**Failure.** Two-sided. It makes the trigger a true no-op for the World Cup (which is the reassuring half), but it also makes it unable to catch a stray write on any competition whose fixtures are still in the future — the case it exists for. And because it uses RAISE EXCEPTION in a per-row BEFORE trigger, a single league row inside a bulk upsert aborts the entire statement, not just the offending row.

**Fix.** Rename it so it sorts first — e.g. `trg_aa_predictions_reject_league_pool` — and confirm no write path (auto-submit, round submit, mobile PostgREST upserts) ever batches rows across pools. If any does, make it a per-row silent skip plus an out-of-band log rather than a statement-aborting RAISE.

### [MEDIUM] §2's safeguard — dropping tournament_id from PoolData and replacing it with a CompetitionRef discriminated union — is a compiler-driven refactor across roughly fifty competition-scoped read sites, essentially all of which today serve only World Cup pools.

**Failure.** It is the single largest World-Cup-touching change in the plan, and its verification is `npm run build`. The project's own recorded lesson is that a green build is not verification (the read-path cutover shipped green and unexercised). A mechanical rename that compiles can still reorder a filter, drop a scope, or change which branch a nullable takes — and the affected surface is 623 pools' leaderboards, results and breakdowns.

**Fix.** Keep the union — it is the right mechanism — but make L3's acceptance gate a response diff, not a build. Capture /api/pools/:id/leaderboard, /live, /match-scores and /bulk for a representative sample of World Cup pools (one per prediction_mode, one archived, one with a point_adjustment) before the sweep, and assert byte-identical responses after. The plan already proposes this for two endpoints; extend it to the full set and to more than one pool.

### [LOW] broadcast_pool_leaderboard() begins by reading `sync_settings.leaderboard_broadcast_enabled` and returning early if false (verified live). Attaching it verbatim to league_entry_totals — which is the right call — inherits that shared switch.

**Failure.** Flipping the switch to stop a World Cup broadcast storm also silences every live Premier League leaderboard, and vice versa, in the middle of a Saturday 15:00 slate when five or six fixtures are live simultaneously. The live-leaderboard product guarantee is broken for the competition that was not in trouble.

**Fix.** Either document it as an operational fact in the runbook, or have the function read `'leaderboard_broadcast_enabled_' || TG_TABLE_NAME` with a fallback to the existing key — a two-line change that preserves current behaviour exactly.

### [LOW] lib/poolData.ts:182 selects from `teams` with no tournament_id filter. `teams` currently holds 68 rows, 20 of which are Premier League clubs (verified live). §1.2 says the fork "neutralises this for free" — but it only does so because nothing else is ever expected to land in `teams`; the query itself stays unscoped.

**Failure.** Right now, today, every World Cup pool's TeamData[] contains 20 English clubs alongside the 48 national teams. That is live World Cup contamination from the bolt-on, and it survives until L0 deletes the rows. It also means the third competition to touch `teams` reintroduces it, with the same silence.

**Fix.** Add `.eq('tournament_id', pool.tournament_id)` in the same commit as L0. It costs nothing, it fixes a bug that is live rather than hypothetical, and it removes the fork's dependence on `teams` never gaining another row.

## R.silent-wrongness — verdict: **sound-with-fixes**

The architecture is sound and the two load-bearing verified facts hold up: purpose-built league tables genuinely convert about a dozen silent-empty readers into unreachable code, and reusing `broadcast_pool_leaderboard()` verbatim on a table with matching column names does inherit the realtime leaderboard for free. The three containment predicates in §3.2 are correctly identified and necessary. What does not hold up is the claim that §3.4 is the treatment plan: the reader inventory is materially incomplete, and the three safeguards do not cover the gaps. Twelve findings, ranked by how long a human would take to notice. The four worst are (1) the prediction reveal gate has no league arm and falls through to a `prediction_deadline` test — depending on that column's value it either leaks every member's unplayed picks to everyone from day one, or silently kills the visibility feature for the whole season, and two `as PredictionMode` casts stop the compiler catching either; (2) `detectAndPushBadgesForPool` returns at badges.ts:91 when `tournament_id` is null, making §5.4's XP/badge wiring a no-op, so `entry_xp_state` is never written and the leaderboard shows a correct total beside match 0 / bonus 0; (3) the round state machine that opens matchweeks 2–38 is absent from the design entirely, so the season stalls after week one; (4) §3.4's assertion that `fetchRoundMatches` needs no change is false after the L0 revert, and three callers discard its error, which under §5.2's tightened eligibility gate means a whole matchweek scores zero for anyone who did not manually press Submit. None of these require reversing a structural decision — but the plan as written would ship several of them.

### [CRITICAL] The prediction reveal gate has no league arm and falls through to the full_tournament branch. `computeReveal` at /Users/ryansousa/Documents/GitHub/office-pools/lib/predictions/revealGate.ts:54 branches only on `pool.prediction_mode === 'progressive'`; everything else is gated on the single pool-wide `pools.prediction_deadline`. `league_pickem` is not 'progressive', so a league pool takes the deadline branch. Worse, both callers reach it through a type assertion that defeats the compiler: `app/api/pools/[pool_id]/bulk/route.ts:99` does `(pool.prediction_mode ?? 'full_tournament') as PredictionMode` and `app/api/pools/[pool_id]/entries/[entry_id]/predictions/route.ts:106` does `pool.prediction_mode as PredictionMode`. `PredictionMode` (revealGate.ts:20) is a 3-value union; widening the mode union elsewhere will NOT error at either site. The design's §3.4 lists `page.tsx:87` and `PoolDetail.tsx:452` for the `usesRounds` repoint but never lists revealGate.ts, bulk/route.ts, or the per-entry predictions route.

**Failure.** Wrong in both directions, depending on a column that is meaningless for a league. If `pools.prediction_deadline` is set and past (the wizard sets one today, and any value copied from the season's first kickoff qualifies), `computeReveal` returns `{revealed:true, scope:'all'}` and `gatePoolPredictions` (revealGate.ts:114) hands every member every other member's picks for every unplayed matchweek, including matchweek 38, from day one. That is the exact rule the file's own header says must never break, it enables copying, and it renders as a normal Results/Members tab so nobody reports it. If the deadline is NULL, `isDeadlinePassed(null)` returns false, `computeReveal` returns `{revealed:false}`, and the shipped 'see everyone's picks after lock' feature is silently dead for the entire season — every member's picks show as locked forever, including for completed matchweeks.

**Fix.** Change revealGate.ts:54 to `if (usesRounds(pool.prediction_mode))`, widen `PredictionMode` to include 'league_pickem', and make `filterRevealedPredictions`'s third argument a match→round-key map rather than a match→stage map (for a league the key is `mw_{n}` from `league_fixtures.matchweek_id`, not the synthesised `stage`). Replace both `as PredictionMode` casts with a parse that throws on an unknown mode, so a future mode cannot slip through the same hole.

### [CRITICAL] `detectAndPushBadgesForPool` hard-returns before doing anything when the pool has no tournament: /Users/ryansousa/Documents/GitHub/office-pools/lib/push/badges.ts:89-91 reads `pool.tournament_id` and `if (!tournamentId) return`. Under the design's chosen option A, `pools.tournament_id` is NULL for every league pool. This function is the ONLY writer of `entry_xp_state` (the upsert is at badges.ts:221) and the only caller of `computePoolEntryAnalytics` (badges.ts:156). §5.4 point 4 says `league_reconcile_fixtures` will fire `computePoolEntryAnalytics` and `detectAndPushBadgesForPool` 'exactly as recalculatePool:104-109 already does' — but that call is a no-op for a league pool.

**Failure.** No `entry_xp_state` row is ever written for a league entry. `app/api/pools/[pool_id]/leaderboard/route.ts:201-202` gates `matchPoints`/`bonusPoints` on that row existing, so the leaderboard renders a self-contradicting row: 'Total 450 pts' beside 'Match 0 / Bonus 0'. Form dots come back empty, hit rate 0%, level 1 for everyone all season, `exact_count` 0, no Sharpshooter/Hot Streak/Contrarian awards or superlatives, no badge or level-up pushes. Every value is a plausible number, none of them errors, and it reads as 'the league mode just isn't gamified yet'. The comment at badges.ts:96-99 records that this same pipeline was already a silent no-op once for a different reason.

**Fix.** Remove the `tournament_id` dependency from `detectAndPushBadgesForPool`: it is only used at badges.ts:132-135 to fetch matches for stage/group_letter lookups. Take a competition ref instead, fetch `league_fixtures` for a league pool, and delete the `if (!tournamentId) return` guard. Add an assertion in `league_reconcile_fixtures`'s verification step that `entry_xp_state` row count equals eligible entries — the design's own `league_scoring_health` view already proposes `xp_rows = eligible_entries`, so make that check part of L5's exit criteria, not L7's.

### [CRITICAL] The round state machine — the thing that opens matchweek 2 through 38 — is entirely absent from the design. §3.4 lists only `lib/auto-submit.ts:103` and `:288`. It never mentions `autoCompleteProgressiveRounds` (/Users/ryansousa/Documents/GitHub/office-pools/lib/auto-submit.ts:398-520), `sendAutoRoundOpenNotifications` (:545-570), `app/api/pools/[pool_id]/rounds/route.ts:37` (`if (pool.prediction_mode !== 'progressive')`), or `app/api/pools/[pool_id]/rounds/[round_key]/state/route.ts:69` (same gate). `autoCompleteProgressiveRounds` fetches the next round's fixtures from `matches` (auto-submit.ts:475-483) and requires `nextMatches.every(m => m.home_team_id && m.away_team_id)` at :486 — columns that do not exist on `league_fixtures`.

**Failure.** Matchweek 1 opens at pool creation via `seedPoolRoundStates`. Nothing ever opens matchweek 2. `autoCompleteProgressiveRounds` gets `nextMatches.length === 0`, hits the `continue` at :485, and the season stalls after one week with no error anywhere — the UI simply shows every remaining matchweek as 'locked', which is a legitimate state. Separately, `rounds/route.ts:37` and `rounds/[round_key]/state/route.ts:69` reject league pools outright, so the admin cannot open a round manually either. The failure surfaces roughly eight days after launch as 'why can't anyone predict this week', with no log line to point at.

**Fix.** Add `autoCompleteProgressiveRounds`, `sendAutoRoundOpenNotifications`, `rounds/route.ts` and `rounds/[round_key]/state/route.ts` to the L5/L8 inventory, repoint their fixture reads through a fixture adapter, replace `mode !== 'progressive'` with `!usesRounds(mode)` at both route gates, and replace the `home_team_id && away_team_id` readiness test with something true by construction for a league (a league fixture always names its clubs).

### [CRITICAL] §3.4 asserts '`fetchRoundMatches` is already matchweek-aware; only `countForEntryInRound` changes'. That is false after the L0 revert. /Users/ryansousa/Documents/GitHub/office-pools/lib/roundMatches.ts:34-40 queries `.from('matches').eq('tournament_id', …)` and, for a matchweek key, `.eq('stage','regular_season').eq('round_number', selector.roundNumber)` — both the `stage` value and the `round_number` column are dropped by L0. Three of its five callers discard the returned error: auto-submit.ts:262, auto-submit.ts:570, and rounds/[round_key]/state/route.ts:298. This compounds with §5.2's decision to make `entry_round_submissions` the ONLY eligibility gate (dropping the `pe.has_submitted_predictions` arm that migration 046 currently carries at lines 160/210/327/372).

**Failure.** `autoSubmitRoundEntries` calls `fetchRoundMatches` at :262, discards the 'column round_number does not exist' error, gets `roundFixtures.length === 0`, hits `continue` at :285 for every entry — so no `entry_round_submissions` row is written, no auto-submit email and no push go out — and then still transitions the round to `in_progress` at :346. Under §5.2's tightened gate, every member who made picks but did not manually press Submit scores exactly zero for that matchweek. Their picks are visibly in the database, the round shows as in_progress, and the leaderboard just shows them having a bad week. At :570 and state/route.ts:298 the same discarded error produces a round-open email that says 'Make your predictions' for 0 matches.

**Fix.** Repoint `fetchRoundMatches` at `league_matchweeks`/`league_fixtures` for matchweek keys as part of L1, not L4; make it take a `CompetitionRef` so the compiler forces every caller. Stop discarding its error at auto-submit.ts:262, auto-submit.ts:570 and state/route.ts:298 — an empty round there is never a valid answer. Either keep the `pe.has_submitted_predictions` disjunct in the league eligibility gate, or make L5's synthetic-matchweek verification explicitly cover 'entry made picks, never pressed Submit, auto-submit ran'.

### [HIGH] Every admin action that says it recalculates a pool is a success-reporting no-op for league pools. `recalculatePool` returns `{success:true, entriesProcessed:0, matchScoresWritten:0}` at /Users/ryansousa/Documents/GitHub/office-pools/lib/scoring/recalculate.ts:104-112 for `isLeaguePool`, and the design keeps that (§5.1) while also removing the only backstop — `shadow_reconcile_adjustments` (cron jobid 20) is disarmed by the §3.2 containment predicate with no league equivalent. `league_reconcile_fixtures` selects work only by diffing `league_fixtures` against `league_fixture_state`, so nothing that changes an entry rather than a fixture triggers a recompute. The callers are `app/pools/[pool_id]/admin/MembersTab.tsx:314` (remove member), `:346` (delete entry), `:402-410` (point adjustment — writes `pool_entries.point_adjustment` then POSTs /recalculate), `app/pools/[pool_id]/admin/ScoringTab.tsx:700` (scoring price change), `app/pools/[pool_id]/PoolDetail.tsx:739` (leave pool), and mobile's `SettingsTab.tsx:261` / `PoolInfoTab.tsx:77`.

**Failure.** An admin awards +50 points with a reason, sees a success toast, and the member's total never moves — not on the leaderboard, not in the broadcast, not in `league_entry_totals` — until some unrelated fixture happens to complete in that pool and `league_finalize_totals` runs for it. Before the season's first completed fixture, or after the final matchweek, it never lands at all. Same for a price change made mid-season under D4's reuse of `pool_settings.group_*`: the admin changes 100/75/50 to something else, gets success, and nothing rescores. Members leaving mid-season leave stale ranks behind for up to a week.

**Fix.** Give `/api/pools/[pool_id]/recalculate` a league arm that calls `league_finalize_totals(ARRAY[pool_id])` (and, for a price change, re-runs `league_score_fixture` over that pool's completed fixtures) instead of early-returning true. Cheapest sufficient version: make `recalculatePool` return `{success:false, error:'league pools recalculate via league_finalize_totals'}` so the admin UI shows a failure rather than a lie, then wire the real call. Add a league analogue of the adjustment reconciler, or fold `pool_entries.point_adjustment` into a trigger on that column.

### [HIGH] §3.4 and §5.4 rest on 'getScoringSource third return value league … format-driven, so there is no allowlist to forget'. Two of the highest-traffic scoring readers do not call `getScoringSource` at all — they read the allowlist directly. /Users/ryansousa/Documents/GitHub/office-pools/app/api/users/[user_id]/home-scoring/route.ts:124-131 calls `getShadowReadPools(admin)` and buckets every pool into `shadowIds` or `prodIds`, then calls `entry_match_score_summary(ids, 'shadow'|'prod')` and `readEntryScoring(ids, 'shadow'|'prod')`. `app/pools/page.tsx:143-155` does the same (`shadowPools.has(m.pools?.pool_id)`), as does `app/dashboard/page.tsx`. Adding a `'league'` arm to migration 037's function, as §3.4 proposes, is necessary but not sufficient: no caller will ever pass it.

**Failure.** A league pool is not in `shadow_read_enabled_pools`, so it lands in `prodIds`. `entry_match_score_summary(prodIds,'prod')` scans `match_scores`, finds nothing, and returns no row — which the route treats as a legitimate zero summary (the seeding comment in migration 037 says so explicitly). The RN home screen shows the correct total points (rescued by the D5 `pool_entries` mirror) next to total_completed 0, exact 0, correct 0, streak 0 and empty form dots, all season. This is verbatim the failure recorded in memory as 'RN home screen's form/accuracy/streak were dead this way'. If someone 'fixes' it by adding the league pool to the allowlist, `readEntryScoring(…, 'shadow')` then reads `shadow_entry_totals`, finds nothing, and the home screen shows 0 points instead.

**Fix.** Route home-scoring/route.ts, app/pools/page.tsx and app/dashboard/page.tsx through `getScoringSource` per pool rather than through `getShadowReadPools`, and make `getScoringSource` take the pool row (or `CompetitionRef`) so the league arm cannot be bypassed. Assert in CI that `getShadowReadPools` has exactly one caller — `getScoringSource`.

### [HIGH] `lib/push/badges.ts:376` selects its score table by a THIRD mechanism, independent of both `getScoringSource` and the pool allowlist: `const scoreTable = (await isProdScoringEnabled(adminClient)) ? 'match_scores' : 'shadow_match_scores'` — a global boolean. It will never read `league_match_scores`. §3.4 lists only badges.ts:384 (`predictionCount`) and :388-391 (`current_rank`).

**Failure.** `scores` is empty for every league entry, so six badges can never fire: sharpshooter (:402), oracle / on_fire / ice_breaker (:413-428), showtime (:459), grand_finale (:470). More pointedly, `top_dog` at :430 is gated on `currentRank === 1 && totalEntries >= 2 && scores.length > 0` — so it will NOT fire even with the D5 mirror in place, which directly falsifies D5's stated justification ('it makes top_dog fire correctly with zero code'). And once §3.4's `predictionCount` repoint lands, `lightning_rod` at :453 evaluates `predictionCount > 0 && predictionCount >= matches.length` with `matches` empty for a league pool — so the badge whose meaning is 'a prediction for every match in the tournament' is awarded to everyone after their first matchweek. That is a wrong award, not a missing one, and a badge that once unlocks is kept forever (badge_unlocks is append-only).

**Fix.** Add badges.ts:376-382 to the repoint list — pick the score table from the same `CompetitionRef`/`getScoringSource` decision as everything else, not from `isProdScoringEnabled`. Make the `lightning_rod` denominator the league season's fixture count (or gate the badge on a competition that has a defined 'all matches' notion) rather than `matches.length`, which is 0 for a league until `matches` is repointed.

### [HIGH] The §3.4 inventory of `predictions` readers is not exhaustive — a `grep -rn "from('predictions')"` finds roughly sixteen sites it does not list. Unlisted: /Users/ryansousa/Documents/GitHub/office-pools/app/profile/page.tsx:121 and :272; app/api/pools/[pool_id]/entries/[entry_id]/predictions/route.ts:175 (the shipped 'see everyone's picks' route); app/api/pools/[pool_id]/entries/[entry_id]/breakdown/route.ts:264; app/pools/[pool_id]/PoolDetail.tsx:555; app/api/matches/[match_id]/stats/route.ts:71; app/api/admin/send-template/route.ts:370, :447, :900; app/api/admin/send-pending-reminders/route.ts:109, :202; app/api/admin/stats/route.ts:35; lib/email/segments.ts:313; and in the Expo app mobile/lib/usePredictions.ts:103 and :291, mobile/lib/useHomeData.ts:449, mobile/lib/useMatchDetail.ts:223, mobile/app/pool/[id]/banter.tsx:885, mobile/components/pool-detail/BanterSheet.tsx:2294. The design presents §3.4 as the treatment plan, so anything absent from it is treated as needing no work.

**Failure.** Each returns an empty set that reads as 'this member did nothing'. The two that matter most: `entries/[entry_id]/predictions/route.ts:175` is the per-entry view behind the member-predictions-visibility feature — every league member's entry renders as 'made no picks' even after the matchweek locks, while their leaderboard points say otherwise; and `mobile/lib/useHomeData.ts:449` counts predictions per entry, so every league pool card on the mobile home screen reads '0 predicted' and sorts as not-started. `app/api/matches/[match_id]/stats/route.ts:71` shows a crowd-intelligence distribution built from zero predictions. `profile/page.tsx` shows an empty prediction history.

**Fix.** Re-derive the inventory mechanically rather than by hand — `grep -rn "from('predictions')"` across app, lib, mobile, components and scripts — and put each hit in one of three buckets in the plan: repointed, deliberately excluded with a stated reason, or refused loudly. Then add the ESLint `no-restricted-syntax` rule from Layer 1 immediately (L1, not L8) so the list cannot silently grow again.

### [HIGH] The Expo app is not addressed as a surface, and Layer 2's central claim fails there. §3.4 says the `reject_league_pool_prediction` trigger 'converts every missed writer — including mobile — from silent-zero into an error at the exact line'. mobile/lib/usePredictions.ts:291-299 does `supabase.from('predictions').upsert(rows, {onConflict:'entry_id,match_id'})` and, on error, `console.warn('[usePredictions.flushPending] upsert error', upsertErr)` and re-queues into `pendingRef` — it never surfaces anything to the user. Nothing in the design keeps league pools out of the mobile app: mobile/lib/useHomeData.ts:206-224 lists pools straight off `pool_members` with no competition filter, and mobile/lib/usePoolEntries.ts:61-67 reads entries the same way.

**Failure.** A league pool appears in the mobile pool list. Tapping it opens the World Cup prediction flow, which fetches fixtures with `.eq('tournament_id', tournamentId)` (mobile/lib/useMatchDetail.ts:240) — `tournament_id` is NULL, PostgREST renders `tournament_id=eq.null`, zero rows, no error, 'no matches'. If a member does manage to enter picks, `flushPending` fires the RAISE, swallows it into a console.warn the user never sees, shows 'saved', and retries in a loop forever. The picks do not exist. Nobody finds out until the matchweek is scored — and by then the fix requires an EAS OTA per platform, which is a separate release cycle from the web deploy.

**Fix.** Add a mobile gate at L3: hide or hard-block pools with `league_season_id != null` in the Expo app until the mobile repoint ships, and surface `flushPending`'s upsert error in the UI rather than console.warn. Sequence the OTA explicitly in §6 — memory's own EAS note says to verify the API side is deployed before an OTA that calls new routes, and this is the inverse case.

### [MEDIUM] §1.7 argues correctly that column names on `league_entry_totals` are load-bearing, then breaks that principle on `league_match_scores` in §1.6. The DDL names the points column `points`. Every downstream consumer of a score row expects `total_points`, and several also expect `base_points` and `match_number`: `MATCH_SCORE_SHARED_COLS` at /Users/ryansousa/Documents/GitHub/office-pools/lib/scoring/readSource.ts:210-215 and `MATCH_SCORE_NARROW_COLS` at :414, `readMatchScoreClassification` at :360, `readRecentMatchScoreEvents` at :398, migration 037's streak test `r.total_points > 0`, `lib/push/recaps.ts:192` (`s.total_points`), `app/pools/[pool_id]/PointsBreakdownModal.tsx:247-251` (`ms.total_points`, `ms.base_points`, `ms.multiplier`). §1.6's 'omitted and synthesised' list covers `multiplier`, `pso_points`, `teams_match` and the predicted-team ids, but says nothing about `points` → `total_points` or about `base_points`.

**Failure.** If the league read arm forwards `points` unmapped, `MatchScoreData.total_points` and `base_points` are `undefined`. Nothing throws: the breakdown modal renders blank or NaN, `recaps.ts` sums `undefined` into NaN points, and migration 037's streak comparison `undefined > 0` is false so every league entry's streak is permanently 0. All of it renders as legitimate-looking empty state.

**Fix.** Name the column `total_points` and add `base_points` to `league_match_scores`, exactly as §1.7 argues for `league_entry_totals`. It costs one integer column and removes an entire class of mapping mistake from five readers.

### [MEDIUM] Notification and lifecycle sweeps that select globally from `matches` and join pools on `tournament_id` are not in the design at all. `lib/push/time-based.ts:48-72` (`fireMatchStartingPushes`) selects matches in a T+60..T+90 window then `.eq('tournament_id', match.tournament_id)` on pools. `lib/push/recaps.ts:45-63` (`firePendingMatchdayRecaps`) groups the last 48h of `matches` by `tournament_id`. `lib/auto-archive.ts:33-70` builds `tournamentIds` from `pools.map(p => p.tournament_id)` and queries `.eq('tournament_id', tid)`. `app/api/admin/send-pending-reminders/route.ts:159-166` looks up round fixtures via `ROUND_MATCH_STAGES[roundKey] ?? []` — undefined for `mw_7`, giving `.in('stage', [])`.

**Failure.** League pools get no kickoff-reminder pushes, no matchday recap pushes (a shipped feature per the memory notes), and no pending-prediction reminder emails — every sweep finds zero rows and reports success. `autoArchivePools` never archives a league pool, so completed seasons stay 'open' indefinitely (this one is at least guarded by `totalCount > 0`, so it fails safe rather than archiving everything). None of these log anything: a sweep that processed nothing looks identical to a sweep with nothing to do.

**Fix.** Add these four to the §3.4 table with an explicit disposition each — repoint at `league_fixtures`, or exclude with `.is('league_season_id', null)` plus a logged skip count. A sweep that excludes rows should say how many it excluded; that single log line is what turns all of these from silent into visible.

### [MEDIUM] Layer 1 (the compiler) is weaker than claimed, and Layer 3 (the health view) does not cover the failures above. The `PredictionMode` union is re-declared inline as a 3-value literal union in roughly twenty files (app/pools/[pool_id]/types.ts:24, LeaderboardTab.tsx:31, ResultsView.tsx:71, MatchCard.tsx:151 and :419, AnalyticsTab.tsx:42, PointsBreakdownModal.tsx:34, ScoringRulesTab.tsx:205, HowToPlayTab.tsx:10, community/types.ts:173, PoolsClient.tsx:33 and :62, DashboardClient.tsx:38, …) and passed via narrowing assertions at PoolDetail.tsx:1419, 1438, 1818, 1875, 1893 and 2030. A narrowing `as` from a widened union is legal TypeScript and produces no error. Meanwhile `league_scoring_health` (§3.5) asserts only `scored_rows > 0`, `totals_rows = eligible_entries` and `xp_rows = eligible_entries`.

**Failure.** Widening the mode union does not name these call sites — the casts silently coerce 'league_pickem' into the 3-value union, downstream components compute `isProgressive = predictionMode === 'progressive'` as false, and a league pool renders full_tournament copy, full_tournament help text and full_tournament scoring rules. The build is green. Of the eleven findings above, the health view would catch only the `entry_xp_state` one (finding 2); it is blind to the reveal-gate leak, the stalled round machine, the no-op recalculate, the mobile home summary, and the badge table.

**Fix.** Ban the inline literal unions with a lint rule and export a single `PredictionMode` from lib/poolModeInfo.ts; replace every `as 'full_tournament' | 'progressive' | 'bracket_picker'` with the widened type so the call sites become real errors. Extend `league_scoring_health` beyond scoring: assert that the number of matchweeks in a non-'locked' state advances with `now()`, that `entry_round_submissions` rows exist for every entry with picks in a locked matchweek, and that `pool_entries.scored_total_points` equals `league_entry_totals.total_points` including `point_adjustment` — the four checks that would have caught findings 3, 4 and 5.

## R.ui-reuse — verdict: **sound-with-fixes**

The architecture delivers on "reuse the World Cup UI, repointed" — choosing MatchData/TeamData/EntryScoring as the reuse boundary is correct, the realtime leaderboard path is genuinely table-agnostic, and lib/competitionRounds.ts plus ProgressivePredictionsFlow are already league-aware. Forking predictions does NOT drag the shared pool/entry/leaderboard layer into forking: entryAnalytics.ts remains the single owner of entry_xp_state and only its two input reads need repointing. No finding below forces a parallel UI. However, §4.1's "Untouched" list is wrong on four components, because `stage` is a closed bracket enum in places the design did not check: the points breakdown and the Form tab render silently EMPTY for league entries, the XP engine silently mis-awards (every correct league pick fires "Knockout King"), and the prediction form offers a penalty shootout on a league draw. Separately, the L0 revert drops matches.round_number while lib/poolData.ts:55 still names it in a select whose error is discarded — that blanks fixtures for every World Cup pool, breaking the freeze the revert exists to protect. All fixes are small and local to shared components; the plan under-counts the work rather than being wrong in shape.

### [CRITICAL] PointsBreakdownModal renders the match-points breakdown by seven hardcoded calls to renderMatchStageSection('group'|'round_32'|'round_16'|'quarter_final'|'semi_final'|'third_place'|'final') at app/pools/[pool_id]/PointsBreakdownModal.tsx:812-818, reading a Map keyed on match_scores.stage built at :260-268. The design lists this component as "Untouched" in §4.1.

**Failure.** Every league match score carries the synthesised stage 'regular_season', which matches none of the seven keys. matchesByStage.get('group') etc. all return undefined, so renderMatchStageSection returns null at :1027-1028 for all seven sections. A league member opens their points breakdown, sees a correct non-zero total in the header, and an entirely blank Match Points section beneath it. The CSV export has the identical bug at :427, which loops the same seven literals for STAGE SUBTOTALS. This is a silent-empty, the exact failure class §3 is built to eliminate.

**Fix.** Replace the seven literal calls with a derived list: iterate [...matchesByStage.keys()] ordered by a stage-order map (or lib/competitionRounds.ts sortRoundKeys), and do the same at :427. One change, correct for both formats, and it removes the hardcoded stage list rather than adding a league branch beside it.

### [CRITICAL] Stage accuracy on the Form tab is computed by filtering a fixed stage list: app/pools/[pool_id]/analytics/analyticsHelpers.ts:270 does STAGE_ORDER.filter(stage => byStage.has(stage)), where STAGE_ORDER at :123 is the seven World Cup stages. Rows are bucketed by match_scores.stage via matchScoresToPredictionResults at :22-32. §4.1 lists AnalyticsTab/Form as "Untouched".

**Failure.** A league entry's buckets are all keyed 'regular_season', which is absent from STAGE_ORDER, so the filter drops every bucket and computeStageAccuracy returns []. The Form tab's per-stage accuracy breakdown renders empty for every league member, with no error, while the entry has hundreds of scored fixtures. Silent-empty again, and it is not visible in a green build.

**Fix.** After the STAGE_ORDER-ordered pass, append any remaining keys in byStage that STAGE_ORDER does not contain, rather than discarding them, and add a 'regular_season' entry to the STAGE_LABELS map at :113 so the bucket has a human label.

### [HIGH] The XP engine uses `stage === 'group'` as a proxy for "not a knockout match". app/pools/[pool_id]/analytics/xpSystem.ts:336 reads `if (!match || match.stage === 'group') continue` before awarding the +25 "Knockout King" bonus, and :498 does the same before awarding the "Showtime" badge. The design treats XP as inherited unchanged once the two input reads in entryAnalytics.ts are repointed.

**Failure.** A synthesised 'regular_season' is not 'group', so it falls through the guard. Every non-miss league prediction awards +25 Knockout King XP — up to ~380 events per entry per season — with detail text rendered as "Correct result in regular_season" (:343, via formatStageLabel whose default at :664 returns the raw string). Any league exact score awards the Showtime badge. Because entryAnalytics.ts is the single owner of entry_xp_state and runs on the scoring path, this inflates total_xp and current_level on the SHARED leaderboard. This is worse than a silent-empty: it is silently wrong data on the shared layer, and it means repointing the inputs is not sufficient — the XP rules themselves are bracket-shaped.

**Fix.** Gate both branches on an explicit knockout test instead of a negated group test — either a KNOCKOUT_STAGES.includes(match.stage) constant or lib/competitionRounds.ts usesBracket(mode) — so an unrecognised stage awards nothing rather than everything.

### [HIGH] L0's revert inventory drops matches.round_number (added by lib/migrations/024_*.sql), but lib/poolData.ts:55 names round_number explicitly in MATCH_COLUMNS, and the select that uses it at :199-205 destructures only `data`, discarding `error`. L0's verification checks pg_get_functiondef bodies, a re-score of one match per stage, and a count of stage='regular_season' rows — it never renders a pool.

**Failure.** Once the column is dropped, PostgREST 400s on the named column, matchesRaw is null, and `matches` becomes [] for EVERY World Cup pool — no fixtures, no results, no breakdown — with no error surfaced anywhere. Per the project's own recorded lesson on discarded PostgREST errors, this renders empty defaults forever. It lands in the phase whose entire purpose is restoring the frozen World Cup, and L0's stated verification cannot detect it.

**Fix.** Remove round_number from MATCH_COLUMNS (and either from MatchData or synthesise it as null on the World Cup arm) in the same commit that drops the column, and add "open a World Cup pool in a browser and confirm fixtures render" to L0's verify step.

### [HIGH] A league matchweek is rendered by KnockoutStageForm — ProgressivePredictionsFlow.tsx:535 routes every round that is not literally 'group' into it — and that component's penalty-shootout block at components/predictions/KnockoutStageForm.tsx:289 is gated only on `bothResolved && hasPrediction && isDraw`, with no stage or format test. Its local completeness count at :36-48 also treats a draw as incomplete unless PSO scores or a winnerTeamId are set. §4.1 lists both components as "Untouched".

**Failure.** A member predicting 1-1 in a Premier League fixture is shown a "Penalty Shootout Score" panel, or "If this match goes to penalties, who wins?" with radio buttons, plus a warning that "PSO score is required for tied knockout matches". Additionally the form's own header count (:55-57) excludes that fixture while the parent's save-status bar at ProgressivePredictionsFlow.tsx:169 includes it (isPredictionComplete only requires home/away), so one screen shows two contradictory counts. Submission is not blocked, so this ships as visible nonsense rather than a hard failure.

**Fix.** Add a `psoApplies` prop (false when isMatchweekKey(stage), which the file already imports roundLabel from) and use it to gate both the PSO block at :289 and the draw branch of the completeness filter at :40-46.

### [MEDIUM] results/MatchCard.tsx:58 derives its per-match label as `STAGE_LABELS[stage] || stage`, and lib/tournament.ts:134-142 has no 'regular_season' key.

**Failure.** Every league match card (:235) and desktop table row (:494) renders the raw synthesised token — "regular_season · Match #123" — on the Results tab, for all 380 fixtures.

**Fix.** Either add a 'regular_season' entry to STAGE_LABELS in lib/tournament.ts, or have getStageLabel fall back to roundLabel(matchweekKey(round_number)) so the card reads "Matchweek 7".

### [MEDIUM] §1.6 omits stage and base_points from league_match_scores and names the ordinal fixture_number, and §3.4's synthesis list enumerates only multiplier, pso_points, teams_match, predicted_*_team_id and the PSO columns. But MatchScoreData and MatchScoreNarrow (app/pools/[pool_id]/types.ts:326-335 and :391-415) declare stage, base_points and match_number, and consumers read all three: analyticsHelpers.ts:22-32 buckets on stage, PointsBreakdownModal:247 reads base_points, MatchCard.tsx:104-116 reads base_points and multiplier.

**Failure.** An implementer following §3.4's enumerated list literally produces league rows missing stage, base_points and match_number. stage undefined is what drives findings 1 and 2; base_points undefined surfaces as a blank or NaN in the breakdown's CSV and the (base×mult) annotation; match_number undefined breaks the matchNumber sort at PointsBreakdownModal:255 and the ordering in matchScoresToPredictionResults:30.

**Fix.** Make the league arm's synthesis list explicit and complete — stage:'regular_season', base_points: points, match_number: fixture_number — and extend L6's stated "emits all 22 keys" assertion to name these three, since they are the ones the omission list currently misses.

### [MEDIUM] §4.2 says to re-enable the `standings` tab (commented out at PoolDetail.tsx:109) for league pools, but that tab mounts app/pools/[pool_id]/StandingsTab.tsx, which is 629 lines and group-partitioned throughout: stage==='group' filters at :509 and :521, a GROUP_LETTERS loop building standings at :549-551, and a GROUP_LETTERS selector strip at :595. This contradicts §4.3, which correctly identifies the real deliverable as a new LeagueTable component.

**Failure.** Re-enabling the tab for a league pool mounts a component that filters to stage==='group', finds nothing, and renders twelve empty group cards behind an A–L selector — a visibly broken tab shipped by a one-line config change. The §4.3 estimate of "a fork of ~150 lines" is also measured against the wrong file; the reusable piece is BaseTeamTable (105 lines), not StandingsTab.

**Fix.** Drop the re-enable from §4.2. Mount LeagueTable in the ResultsView.tsx:258 slot as §4.3 already specifies, and only introduce a standings tab if LeagueTable is built to fill it.

### [LOW] The design's headline claim #1 — that broadcast_pool_leaderboard() can be attached verbatim and "nothing on the client changes" — rests on the trigger reading new_rows.{match_points, bonus_points, total_points, final_rank, previous_final_rank}. But the client contract is LiveEntry at app/api/pools/[pool_id]/live/route.ts:32-40, which is {match_points, bonus_points, point_adjustment, scored_total_points, current_rank, previous_rank}, and liveMerge.ts:73-80 compares all six fields including point_adjustment. The function body is not in the repo (only drafts/2026-07-29_leaderboard_broadcast_rollback.sql), so the rename and the origin of point_adjustment cannot be confirmed from source.

**Failure.** If the trigger does not emit point_adjustment (or derive it as total_points - match_points - bonus_points), mergeMembers sees undefined !== the held value on every broadcast, marks the entry changed, and writes undefined into the entry — clearing the adjustment display on the live leaderboard until the next full refresh. Low severity because the design reports having read the live body, but the claim is load-bearing for "zero new code" and is asserted rather than shown.

**Fix.** Before relying on the verbatim-attach claim, dump pg_get_functiondef('broadcast_pool_leaderboard') into the design doc and confirm it emits all six LiveEntry keys, point_adjustment included, under the client's names.


---

# A. Audit appendix (counts)

- Front-end consumers of fixture/prediction data: **103**; bracket assumptions found: **21**
- Readers of `predictions`: **77**, of which **65 classified SILENT-EMPTY**
- Revert items: **43**

**Revert blocker:** "Six things I could not settle from the repo, all of which change the revert.\n\n(1) THE STRUCTURAL DECISION IS STILL OPEN. drafts/2026-08-15_league_tournament_structure_plan.md §5 asks Ryan to pick Option A / B / C and has no answer recorded. Your brief describes Option A (own tables including league_predictions) — if that is settled, say so, because it decides whether the 380 fixtures and 20 clubs are MIGRATED into new tables or DELETED and re-imported. My reading of the data says delete-and-re-import: the season is pre-season with 0 results, 0 predictions, 0 pools, and the importer re-pulls it from api-football in one command, so migration buys nothing and costs a bespoke ETL.\n\n(2) THE PREMIER LEAGUE IS LIVE ON PRODUCTION RIGHT NOW. origin/master is at 050043d, which includes the Phase 4 web UI and app/competitions.ts flipped to 'taking pools'. Local master is only 2 commits ahead and both are docs. So the web wizard has been offering league_pickem pools since that deploy. I verified 0 league pools exist as of this audit — but that count must be re-taken immediately before executing, because a single pool created in the interim turns pools_prediction_mode_check from a free revert into a hard failure and puts real member picks on the league fixtures.\n\n(3) MOBILE IS AN OPEN EXPOSURE THAT NO DEPLOY CLOSES. Per the EAS OTA memory the last mobile publish was 2026-07-30, so the format filter added in commit 150ab5e is not on devices. The build in the field lists tournaments unfiltered and offers only the three World Cup modes, so a tester can create a full_tournament pool on Premier League 2026/27 today and it scores zero for every fixture, silently. Deleting the tournaments row is the only thing that closes this. Please confirm no OTA has shipped since 2026-07-30.\n\n(4) THE WEB WIZARD GOES EMPTY. Commit 050043d filters competitions by end_date, and the World Cup ended 2026-07-19. Once the Premier League row is deleted, the web create-pool wizard offers ZERO competitions. That may be the right state, but it is 'nobody can create a pool on SportPool' and should be a deliberate call.\n\n(5) IS 024 §1 IN SCOPE? The tournaments ingest-config columns (format / external_provider / external_league_id / external_season) and syncTargets.ts are competition-neutral, additive, and revert-tolerant by construction. Reverting them costs a permanent env-fallback error on every cron run and breaks both create-pool wizards' `format` select. I recommend keeping them; I need that confirmed either way because it changes items 15, 17, 18, 37 and 38.\n\n(6) HAS THE R20 SHADOW↔PROD CONVERGENCE BEEN DONE? The plan records the diff alarm sitting at 126 mismatched entries across 6 pools and prescribes a targeted write of pool_entries.scored_total_points from shadow for those entries — explicitly NOT recalculatePool, which would push badge and level notifications to members of finished pools. If that write has not happened, the alarm stays red through the revert and will be mistaken for revert damage."

**Most dangerous prediction readers (audit's own ranking):**
- lib/auto-submit.ts:288 (autoSubmitProgressiveRounds) — predCount = 0 -> `continue`, so NO entry_round_submissions row is ever written, yet the round is still transitioned to 'in_progress' at line 346. entry_round_submissions.has_submitted is the exact gate used by mode_submits_per_round / shadow_eligible_entries / shadow_finalize_totals / recalculate.ts:219, so the entry is excluded from ALL scoring. The member fills in a matchweek, the deadline passes, and they are simply not in the competition. No error, no email, no push, cron reports success.
- shadow_score_match — lib/migrations/046_league_scoring.sql:196 (src), :147 (DELETE arm), :315 (affected). Reverting 046 restores the identical reads (drafts/2026-08-14_pre046_shadow_rollback.sql:91/42/204; live today at drafts/2026-07-17_shadow_phaseA_1_widen_match_scores.sql:111/62/227). All 623 pools read shadow, so a league pool's leaderboard is all zeros. Worse, the `affected` CTE means shadow_entry_totals is never recomputed AT ALL for a league pool, and the DELETE arm will eat any rows a future league engine writes.
- lib/migrations/032_shadow_p2_mark_verifies_output.sql:152 — the quarantine safety net asks `EXISTS (SELECT 1 FROM predictions WHERE entry_id = ...)`. A league entry has no rows there, so it can never be quarantined: it is marked 'successfully rederived' having derived nothing. Combined with the NULL watermark at line 96/172 (NULL IS NOT DISTINCT FROM NULL), the entry is permanently marked fresh and never re-derives when a member edits a pick. The one mechanism designed to catch silent shadow corruption is disarmed by construction.
- lib/scoring/recalculate.ts:244 — the prod TS engine builds `predictions: []` for every league entry and returns success:true with matchScoresWritten: 0. Paired with app/api/pools/[pool_id]/bonus/calculate/route.ts:143, where the bulk `bonus_scores` DELETE at line 166 fires unconditionally BEFORE the empty-predictions `continue` at line 181 — so any bonus rows a league engine writes are destroyed and not replaced.
- lib/poolData.ts:485 — one cached read whose empty result fans out to ~8 surfaces at once: Banter member levels (CommunityTab.tsx:256 -> every member shows Level 1 'Rookie'), the Banter share-card picker (SharePredictionModal.tsx:65), Results, Analytics, Members and the entries list. And because getPoolBulkDataCached caches it, the emptiness is served for POOL_CACHE_TTL_SECONDS.
- lib/migrations/045_league_round_identity_and_matchweek_lock.sql:105 — enforce_prediction_before_kickoff is attached to public.predictions (drafts/2026-07-12_prediction_kickoff_lock.sql:74-77). This one is silently PERMISSIVE rather than silently empty: fork the table without re-attaching the trigger and the matchweek lock 045 exists to create vanishes, letting a member pick on Sunday having watched Saturday's results. Memory records it MUST be DB-level because mobile writes predictions directly to PostgREST.
- scripts/audit-bonuses.ts:111 and scripts/verify-bulk-reveal-gate.ts:167 — the two verification tools return CLEAN on a league pool they never actually examined. audit-bonuses is the recipe memory says to re-run at every competition end; verify-bulk-reveal-gate is the privacy check for the member-predictions feature. Both give a green light with zero coverage.
- lib/migrations/041_pool_archive_policies.sql:67/:82 plus lib/migrations/023_predictions_select_rls_tighten.sql:14/:31 — four RLS policies bound to public.predictions. A league_predictions table with RLS on and no policies is deny-all for the anon client that mobile uses for both reads (usePredictions.ts:103) and writes (usePredictions.ts:291), and the discarded-PostgREST-error pattern means neither the empty read nor the 400 on write will surface anywhere.
