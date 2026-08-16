# Premier League backend — design v2 + second adversarial review

> **Status:** for Ryan, 2026-08-16. NOT BUILDABLE YET — see §R. Supersedes
> `2026-08-15_premier_league_backend_design.md` as a design; that file is kept for its v1 findings.
>
> **Round 2 of an audit → design → review loop.** v2 fixed v1's 8 criticals (all four reviewers
> independently confirmed they were *genuinely fixed, not reworded*) and added the round state
> machine v1 omitted. The second review then found **9 new criticals**, and the completeness critic
> returned **needs-rework**.
>
> | Lens | Verdict | Critical | High |
> |---|---|---|---|
> | World Cup safety | sound-with-fixes | 2 | 3 |
> | Silent wrongness | sound-with-fixes | 2 | 3 |
> | UI reuse | sound-with-fixes | 1 | 3 |
> | **Completeness** | **needs-rework** | **4** | **5** |
>
> ⚠ **Live and urgent, discovered during this pass:** a real Premier League pool exists in
> production — `PTQPZ797`, 3 members, created 2026-08-16 15:27 UTC. Matchweek 1 locks Fri 21 Aug
> 19:00. On today's deployed code those members' picks would score **zero, silently**, and several
> findings below say they would also hit 403s on save. This is not a design problem; it is live.

---

I have verified the load-bearing claims against live code and the live database. Here is design v2.

---

# Premier League backend — design v2

> **Status:** for Ryan, 2026-08-16. Supersedes `drafts/2026-08-15_premier_league_backend_design.md` entirely — a reader needs nothing from v1.
>
> **What this implements (Ryan, 2026-08-15):** every competition gets its own backend structure; the Premier League is built ground-up; the World Cup backend is frozen and restored; the front end reuses the World Cup UI repointed at league data; predictions fork into `league_predictions` while `pools` / `pool_members` / `pool_entries` and everything hanging off an entry stay shared. Premier League only — no generic league abstraction.
>
> **v2 changes 19 things v1 got wrong** (8 CRITICAL, 11 HIGH), adds the round state machine v1 omitted, and adds **7 findings none of the three reviewers caught** — two of which are the same class of bug as the prod-stopping one, and one of which is a live latent World Cup defect that the Premier League will be the first competition to trigger.

---

## 0. Three things established before anything else

### 0.1 The live state has moved since v1 was written

v1's reviews assert "0 league pools, 0 league predictions, 0 `mw_*` round states." That was true on 2026-08-15. Verified live today:

| | |
|---|---|
| `pools` total | **624** (was 623) |
| `pools WHERE prediction_mode='league_pickem'` | **1** — `c16a9a56-7550-46b6-a58a-8f6b124a8f32` "Premier League 2026/2027 Pool", created 2026-08-16 15:27 UTC, 3 members, 3 entries |
| `pool_round_states` for that pool | **38** |
| `matches WHERE stage='regular_season'` | 380 |
| `teams` | **68** (48 national + 20 PL clubs) |
| `pools.prediction_deadline` on the league pool | **2026-08-21 18:00:00+00** |

That pool is downstream-clean (0 predictions, 0 score rows, 0 XP rows), so it is safe to delete — but it must be deleted **explicitly and first**, because `pools_tournament_id_fkey` is `ON DELETE CASCADE` and deleting the `tournaments` row would otherwise take a 3-member pool with it silently. The 38 `pool_round_states` rows must go with it (§3).

`leaderboard_broadcast_enabled = true` and `prod_scoring_enabled = true` in `sync_settings` — both live paths are armed.

### 0.2 The guard rule — stated once, applied everywhere

v1's prod-stopping bug was proposing `pool.league_season_id !== null` as the guard in `lib/scoring/recalculate.ts` when the query at `lib/scoring/recalculate.ts:74-77` is:

```ts
.from('pools').select('pool_id, tournament_id, prediction_mode')
```

`undefined !== null` is `true`, so every one of 624 pools takes the early return at `recalculate.ts:103-112` and returns `{ success: true, entriesProcessed: 0 }`. Verified.

**The rule v2 adopts:**

> **A competition guard may only read columns its own `SELECT` names, and the parse must throw when they are absent — never default.**

```ts
// lib/competition/ref.ts
export type CompetitionRef =
  | { kind: 'world_cup'; tournamentId: string }
  | { kind: 'league';    seasonId: string }

/** Columns EVERY pool select feeding a competition guard must carry. */
export const COMPETITION_COLUMNS = 'tournament_id, league_season_id'

export function competitionRef(row: object): CompetitionRef {
  if (!('tournament_id' in row) || !('league_season_id' in row)) {
    // NOT a default. An absent column is a widening bug in the caller's
    // select, and every silent default is wrong in one direction or the
    // other: default-to-world-cup disables the league engine, default-to-
    // league disables prod scoring for 623 pools.
    throw new Error('competitionRef: select must include COMPETITION_COLUMNS')
  }
  const t = (row as Record<string, unknown>).tournament_id
  const s = (row as Record<string, unknown>).league_season_id
  if (typeof s === 'string') return { kind: 'league', seasonId: s }
  if (typeof t === 'string') return { kind: 'world_cup', tournamentId: t }
  throw new Error('competitionRef: pool has neither competition')
}
```

**Where the reviewer is wrong.** R.wc-safety W1's fix is "use loose `!=` so an absent column can't flip the branch." That is correct *for `recalculatePool`* — absent column reads as World Cup, which preserves prod scoring. It is **wrong as a general rule**, and applying it generally would ship the second instance of the same bug (§0.3). A throw is the only treatment that is right in both directions.

### 0.3 The second instance of the same bug — nobody caught it (N1)

v1 §3.4 also says: *"`getScoringSource` — third return value `'league'`, keyed on `pool.league_season_id IS NOT NULL` — not on the mode."*

The live signature is `lib/scoring/readSource.ts:83-90`:

```ts
export async function getScoringSource(
  admin: AdminClient, poolId: string, predictionMode: string,
): Promise<ScoringSource> {
  if (predictionMode === 'league_pickem') return 'shadow'
  const pools = await getShadowReadPools(admin)
  return pools.has(poolId) ? 'shadow' : 'prod'
}
```

There is no pool row. `pool.league_season_id` does not exist in this function's scope; the proposal is uncompilable at best and, written as `(pool as any).league_season_id`, silently `undefined`. Meanwhile note what the live line 88 already does: it returns `'shadow'` for `league_pickem`, so **today's league pool already reads `shadow_entry_totals` and `shadow_match_scores`, both empty** — that is the mechanism of "a league pool scores zero silently."

**v2:** change the signature to `getScoringSource(admin, poolId, ref: CompetitionRef)`. The `league_pickem` mode check at `:88` is deleted; `ref.kind === 'league'` returns `'league'`. Every caller must now produce a `CompetitionRef`, which means widening its pool select, which the compiler enforces and `competitionRef()` enforces at runtime.

---

## A. Finding disposition — all 32, plus 7 new

`W` = R.wc-safety, `S` = R.silent-wrongness, `U` = R.ui-reuse, `N` = new in v2.

| # | Sev | Finding | v2 disposition |
|---|---|---|---|
| **W1** | CRIT | `recalculate.ts` re-key on unselected column | **ACCEPTED, generalised.** §0.2 guard rule. Guard stays `pool.prediction_mode === 'league_pickem' \|\| ref.kind === 'league'` with `league_season_id` added to the select at `recalculate.ts:76`. Rejected the reviewer's "loose `!=`" as a general rule (§0.2) |
| **W2** | CRIT | `shadow_calculate_bonuses` missing from L0 revert; dropping the predicate breaks cron 19/20 | **ACCEPTED.** L0 step 6 reverts it explicitly (single-token substitution). And §7.4: `mode_submits_per_round` / `stage_has_scheduled_teams` are **KEPT PERMANENTLY** as inert. Never dropped |
| **W3** | HIGH | Rollback file's pricing hunk restores two-base knockout pricing | **ACCEPTED and EXTENDED.** There is a **second** poison source the reviewers missed: `lib/migrations/046_league_scoring.sql:176-180` still contains the two-base `stage_uses_base_prices` CASE and the file is `CREATE OR REPLACE`-idempotent. Both files get a DO-NOT-RUN header in L0 step 0 |
| **W4** | HIGH | L0's verification is itself a write that fires the broadcast | **ACCEPTED.** L0 verify is now a read-only CTE (§11 L0) |
| **W5** | HIGH | `shadow_detect_diffs` justification is a misreading | **ACCEPTED — reviewer is right, v1 was wrong.** Verified live: the mismatch INSERT is `FROM shadow_entry_totals s JOIN pool_entries pe` (INNER, originating at shadow). Absence cannot produce a diff. **Refinement the reviewer missed:** the `coverage` rollup groups by `prediction_mode`, so `league_pickem` becomes its *own* key `{live: N, shadow: 0}` — it does not corrupt the World Cup numbers, it adds a permanently-red row. Predicate goes on **both** sites; the mismatch one matters only once the D5 mirror exists |
| **W6** | MED | `shadow_eligible_entries` missing from containment set | **ACCEPTED.** Fourth containment predicate (§7.2) |
| **W7** | MED | League arms inside shared SQL functions | **ACCEPTED.** Separate `league_match_prediction_accuracy(uuid)` and `league_entry_match_summary(uuid[])`; TS dispatch on `CompetitionRef`. Both World Cup bodies stay byte-identical |
| **W8** | MED | `reject_league_pool_prediction` trigger name-order | **ACCEPTED with change.** Renamed `trg_aa_predictions_reject_league_pool`, and changed from `RAISE` to **per-row silent skip + `RAISE WARNING`**, because `lib/auto-submit.ts` and mobile both batch upserts and a statement abort would take good rows with the bad one (§7.3) |
| **W9** | MED | `CompetitionRef` sweep verified only by `npm run build` | **ACCEPTED.** L3 gate is a captured response diff across 4 endpoints × 5 pools (§11 L3) |
| **W10** | LOW | Shared `leaderboard_broadcast_enabled` kill switch | **ACCEPTED, folded into N2.** The trigger is being edited anyway; per-table key with fallback |
| **W11** | LOW | `poolData.ts:182` unscoped `teams` read | **ACCEPTED, promoted to L0 step 1.** Verified live: 68 rows, so every World Cup pool's `TeamData[]` carries 20 English clubs *today*. Add `.eq('tournament_id', …)` — a live bug fix, not a hypothetical |
| **S1** | CRIT | Reveal gate has no league arm | **ACCEPTED, and the direction is now determinate.** The live league pool's `prediction_deadline` is `2026-08-21 18:00Z`, one hour before the first kickoff — so it is the **leak** branch, not the dead-feature branch. From 18:00 on 21 Aug, `computeReveal` (`lib/predictions/revealGate.ts:54,66`) returns `{revealed:true, scope:'all'}` and every member sees everyone's matchweek-38 picks. Fix in §6.3 |
| **S2** | CRIT | `detectAndPushBadgesForPool` returns at `badges.ts:91` on null `tournament_id` | **ACCEPTED.** Verified: `lib/push/badges.ts:89-91`. Fix takes a `CompetitionRef`; `xp_rows = eligible_entries` moves into **L5** exit criteria, not L7 |
| **S3** | CRIT | Round state machine absent | **ACCEPTED — and answered differently from the reviewer.** The reviewer says repoint `autoCompleteProgressiveRounds`. v2 says **a league pool holds zero `pool_round_states` rows** and matchweek state is derived in SQL. §3 is a first-class section with the evidence |
| **S4** | CRIT | `fetchRoundMatches` claim false; three callers discard its error; compounds with the submission gate | **ACCEPTED, and dissolved rather than patched.** `lib/roundMatches.ts` is deleted (§3.5) and the submission gate is removed from scoring entirely (§5.2) — a stored league prediction *is* an eligible one. That removes the compound failure at its root |
| **S5** | HIGH | `recalculatePool` is a success-reporting no-op for admin actions | **ACCEPTED.** §5.5: `/recalculate` gets a league arm calling `league_rescore_pool()`; `recalculatePool` returns `success:false` for league so a missed path shows a failure, not a lie |
| **S6** | HIGH | `getShadowReadPools` bypasses `getScoringSource` | **ACCEPTED and EXPANDED.** Reviewer named 3 bypass sites; there are **8** non-test callers (§6.1) — including `scripts/verify-read-paths.ts:53`, meaning the verification script itself cannot see a league pool |
| **S7** | HIGH | `badges.ts:376` selects the score table by a third mechanism | **ACCEPTED.** Verified `lib/push/badges.ts:376`. Also accepted: `lightning_rod` becomes a *wrong award*, and `badge_unlocks` is append-only, so it cannot be taken back |
| **S8** | HIGH | Prediction-reader inventory not exhaustive | **ACCEPTED and re-derived mechanically.** `grep -rn "from('predictions')" app lib mobile components scripts` → **46 sites across ~30 files** (not "~16 unlisted"). §6.4 buckets all of them; the ESLint rule lands in **L1**, not L8 |
| **S9** | HIGH | Expo app not addressed; Layer 2 fails there | **ACCEPTED.** §10 is a first-class section. Mobile hard-blocks league pools at L3 |
| **S10** | MED | `league_match_scores` column naming | **ACCEPTED.** `points` → `total_points`, `base_points` added (§1.6) |
| **S11** | MED | Notification / lifecycle sweeps absent | **ACCEPTED.** §8 |
| **S12** | MED | Layer 1 weaker than claimed; Layer 3 too narrow | **ACCEPTED.** Single exported `PredictionMode`, lint ban on inline literal unions, casts replaced; `league_scoring_health` gains 4 checks (§7.5) |
| **U1** | CRIT | `PointsBreakdownModal` seven hardcoded stages | **ACCEPTED.** De-hardcode at `:812-818` and `:427` |
| **U2** | CRIT | `analyticsHelpers` `STAGE_ORDER.filter` drops unknown buckets | **ACCEPTED.** Append-unknown rather than discard. Note the blast radius is *mobile*, not the web Form tab — `app/api/pools/[pool_id]/entries/[entry_id]/analytics/route.ts:197` → `mobile/lib/api.ts` — so it is invisible to any web QA pass |
| **U3** | HIGH | `xpSystem` `stage === 'group'` as knockout proxy | **ACCEPTED — the one finding that is silently *wrong*, not silently empty.** Invert to a positive knockout test at `xpSystem.ts:336` and `:498` |
| **U4** | HIGH | L0 drops `matches.round_number`; `poolData.ts:54` names it; error discarded | **ACCEPTED and RESOLVED BY NOT DOING IT.** Verified: `MATCH_COLUMNS` at `lib/poolData.ts:54` names `round_number`, and `lib/poolData.ts:198-205` destructures only `{ data: matchesRaw }`. v2 **keeps `matches.round_number` and `matches.round_label` permanently** (nullable, zero non-null rows after the data delete) rather than dropping them. Nothing to break |
| **U5** | HIGH | `KnockoutStageForm` offers a penalty shootout on a league draw | **ACCEPTED.** `psoApplies` prop gating `:289` and `:40-46` |
| **U6** | MED | `MatchCard` raw stage token | **ACCEPTED.** Route through `roundLabel(matchweekKey(round_number))` |
| **U7** | MED | Synthesis list misses `stage`, `base_points`, `match_number` | **ACCEPTED.** §6.2 names all 22 keys explicitly |
| **U8** | MED | `StandingsTab` re-enable is wrong | **ACCEPTED — v1 was wrong.** Drop the re-enable at `PoolDetail.tsx:109`. `StandingsTab.tsx` is 629 lines and group-partitioned; it **cannot be reused**. `LeagueTable` mounts in the `ResultsView.tsx:255-266` slot only |
| **U9** | LOW | Broadcast payload vs `LiveEntry` contract asserted, not shown | **ACCEPTED and PROMOTED TO CRITICAL — see N2** |
| **N1** | CRIT | *(new)* `getScoringSource` keyed on a column its signature does not receive — second instance of W1 | §0.3 |
| **N2** | CRIT | *(new)* `broadcast_pool_leaderboard()` emits **`total_points`**, not `scored_total_points`, and emits **no `point_adjustment`** | §1.7 — verified from `pg_get_functiondef`. This is a live latent World Cup bug; the Premier League triggers it first |
| **N3** | HIGH | *(new)* `getShadowReadPools` has 8 callers including the verification script | §6.1 |
| **N4** | HIGH | *(new)* `ROUND_MATCH_STAGES[roundKey] ?? []` → `.in('stage', [])` at 4 sites | §8 |
| **N5** | MED | *(new)* `shadow_detect_diffs` coverage adds a new key rather than corrupting an old one | W5 refinement |
| **N6** | MED | *(new)* 46 `from('predictions')` sites, mechanically counted | S8 |
| **N7** | MED | *(new)* Derived round state changes who sets `predictions_submitted_at` — the rank tiebreaker | §5.3 |

---

## 1. DDL — eight tables

Prefix `league_`. Nothing named for a bracket; nothing named for a country. **Carried forward from v1 unchanged unless a finding required otherwise.**

### 1.1 `league_seasons`

```sql
CREATE TABLE league_seasons (
  season_id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_slug      text        NOT NULL,   -- 'premier-league'
  competition_name      text        NOT NULL,   -- 'Premier League'
  season_label          text        NOT NULL,   -- '2026/27'
  season_start_year     integer     NOT NULL,
  country_code          char(3)     NOT NULL,   -- 'ENG'
  club_count            integer     NOT NULL,   -- 20
  matchweek_count       integer     NOT NULL,   -- 38
  first_kickoff_at      timestamptz,
  last_kickoff_at       timestamptz,
  logo_url              text,
  external_provider     text        NOT NULL DEFAULT 'api_football',
  external_league_id    integer     NOT NULL,   -- 39
  external_season       integer     NOT NULL,   -- 2026
  regular_season_phase  text        NOT NULL,   -- 'Regular Season', the feed's own string
  imported_at           timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_seasons_provider_key  UNIQUE (external_provider, external_league_id, external_season),
  CONSTRAINT league_seasons_slug_year_key UNIQUE (competition_slug, season_start_year),
  CONSTRAINT league_seasons_clubs_ck      CHECK (club_count BETWEEN 4 AND 30),
  CONSTRAINT league_seasons_mw_ck         CHECK (matchweek_count BETWEEN 1 AND 60)
);
```

No `status` column — `lib/competitionFormat.ts:hasCompetitionEnded` already established that competition state is date-computed, never authored (`tournaments.status` still read `'upcoming'` a month after the final). No `num_groups` / `teams_per_group` / `host_countries` — the three NOT NULL columns on `tournaments` that make a league impossible to represent honestly there.

### 1.2 `league_clubs`

```sql
CREATE TABLE league_clubs (
  club_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id        uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  name             text    NOT NULL,      -- 'Manchester United'  (was teams.country_name)
  short_name       text    NOT NULL,      -- 'Man Utd'
  abbreviation     char(3) NOT NULL,      -- 'MUN'                (was teams.country_code)
  crest_url        text,                  --                      (was teams.flag_url)
  external_club_id integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_clubs_season_ext_key  UNIQUE (season_id, external_club_id),
  CONSTRAINT league_clubs_season_abbr_key UNIQUE (season_id, abbreviation),
  CONSTRAINT league_clubs_season_name_key UNIQUE (season_id, name)
);
CREATE INDEX idx_league_clubs_season ON league_clubs(season_id);
```

Gone: `group_letter`, `group_position`, `fifa_ranking_points`, `final_position`. `short_name` earns its place — `lib/poolData.ts:201-205` sorts by `group_letter, fifa_ranking_points`; a club list has no such ordering and the UI needs a name that fits a match card.

**This does not by itself fix `poolData.ts`'s unscoped `teams` read (W11).** v1 claimed it did. It only means nothing *new* lands in `teams`; the 20 clubs are there today and the query is still unscoped. The scope filter is a separate, explicit L0 step.

### 1.3 `league_matchweeks` — first-class, because the lock and the state machine live here

```sql
CREATE TABLE league_matchweeks (
  matchweek_id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id               uuid    NOT NULL REFERENCES league_seasons(season_id) ON DELETE CASCADE,
  matchweek_number        integer NOT NULL,          -- 1..38
  label                   text    NOT NULL,          -- 'Matchweek 7'
  provider_round          text    NOT NULL,          -- 'Regular Season - 7', verbatim
  fixture_count           integer NOT NULL DEFAULT 0,
  completed_fixture_count integer NOT NULL DEFAULT 0,
  first_kickoff_at        timestamptz,
  last_kickoff_at         timestamptz,
  lock_at                 timestamptz,               -- == first kickoff, then FROZEN. THE deadline.
  open_notified_at        timestamptz,               -- per-SEASON watermark, never per-pool
  lock_reminder_sent_at   timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_matchweeks_season_no_key    UNIQUE (season_id, matchweek_number),
  CONSTRAINT league_matchweeks_season_round_key UNIQUE (season_id, provider_round),
  CONSTRAINT league_matchweeks_no_ck            CHECK (matchweek_number BETWEEN 1 AND 60),
  -- Makes "open but empty" a constraint violation rather than a plausible render.
  CONSTRAINT league_matchweeks_empty_has_no_lock_ck
    CHECK ((fixture_count = 0) = (lock_at IS NULL))
);
CREATE INDEX idx_league_matchweeks_season_no ON league_matchweeks(season_id, matchweek_number);
CREATE INDEX idx_league_matchweeks_lock      ON league_matchweeks(season_id, lock_at);
```

`UNIQUE (season_id, provider_round)` structurally kills the Belgium/Scotland ordinal-collision class that `lib/integrations/apiFootball/importLeagueSeason.ts:365-385` guards procedurally today: two rounds sharing an ordinal cannot both exist, and two phases sharing an ordinal produce two rows that then violate the `matchweek_number` unique. The guard moves from procedural to declarative.

`lock_at` stored, not computed. The live `enforce_prediction_before_kickoff` computes the league deadline as `MIN(match_date) … WHERE tournament_id = ? AND round_number = ? AND stage='regular_season'` — an aggregate on *every* prediction insert and update. Stored, it is one indexed lookup. And freezing it once passed makes "a locked matchweek can never reopen" a database invariant, whatever the feed later does to the calendar.

### 1.4 `league_fixtures`

```sql
CREATE TABLE league_fixtures (
  fixture_id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id             uuid    NOT NULL REFERENCES league_seasons(season_id)       ON DELETE CASCADE,
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
  CONSTRAINT league_fixtures_season_ext_key UNIQUE (season_id, external_fixture_id),
  CONSTRAINT league_fixtures_season_num_key UNIQUE (season_id, fixture_number),
  CONSTRAINT league_fixtures_clubs_ck       CHECK (home_club_id <> away_club_id),
  CONSTRAINT league_fixtures_status_ck      CHECK (status IN ('scheduled','live','completed','postponed','cancelled')),
  CONSTRAINT league_fixtures_result_pair_ck CHECK ((home_goals IS NULL) = (away_goals IS NULL)),
  CONSTRAINT league_fixtures_completed_ck   CHECK (NOT is_completed OR home_goals IS NOT NULL)
);
CREATE INDEX idx_league_fixtures_mw     ON league_fixtures(matchweek_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_season ON league_fixtures(season_id, kickoff_at, fixture_number);
CREATE INDEX idx_league_fixtures_open   ON league_fixtures(season_id, kickoff_at) WHERE NOT is_completed;
```

**`matchweek_id` is a hard FK, not an integer.** This is the single most important shape decision in the DDL and the one I would not compromise on. `matches.round_number INTEGER` makes a matchweek a loose ordinal that every query must re-scope by `tournament_id AND stage` — the three-predicate dance at `lib/roundMatches.ts:34-47`. An FK makes "the fixtures of matchweek 7" one indexed lookup that cannot accidentally span a season or a phase.

Gone: `stage`, `group_letter`, `home_team_placeholder`, `away_team_placeholder`, `winner_team_id`, `home_score_pso`, `away_score_pso`, `match_number`, `data_source`.

Two CHECKs `matches` does not have: `matches` permits `is_completed = true` with NULL scores, and permits one score NULL with the other set.

⚠ **`fixture_number` is display and tiebreak only — it is not chronology.** Leagues reschedule, and a league kicks off five or six fixtures simultaneously at Saturday 15:00. `lib/scoring/readSource.ts:331` (`order('match_number', desc).limit(5)`), migration 037's `row_number() over (order by match_number desc)` and `PointsBreakdownModal.tsx:254` all assume a total order. The league's ordering key is the **pair** `(kicked_off_at DESC, fixture_number DESC)`, carried on the score row.

### 1.5 `league_predictions`

```sql
CREATE TABLE league_predictions (
  prediction_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id             uuid NOT NULL REFERENCES pool_entries(entry_id)      ON DELETE CASCADE,
  fixture_id           uuid NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  predicted_home_score integer NOT NULL,
  predicted_away_score integer NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_predictions_entry_fixture_key UNIQUE (entry_id, fixture_id),
  CONSTRAINT league_predictions_home_ck CHECK (predicted_home_score BETWEEN 0 AND 20),
  CONSTRAINT league_predictions_away_ck CHECK (predicted_away_score BETWEEN 0 AND 20)
);
CREATE INDEX idx_league_predictions_fixture   ON league_predictions(fixture_id);
CREATE INDEX idx_league_predictions_entry_upd ON league_predictions(entry_id, updated_at DESC);
```

Deliberately the same natural key and the same cascade semantics as `predictions_entry_id_match_id_key` / `predictions_match_id_fkey`, so every counting query in the audit is a two-token repoint.

Keeping `predicted_home_score` / `predicted_away_score` rather than renaming to `goals`: the vocabulary problem this project has is `country_name` for a club, `group_letter`, `stage`, `placeholder`. "Score" is not part of it, and renaming inserts a field-mapping layer into the hottest read path in the product.

Gone: `predicted_home_pso`, `predicted_away_pso`, `predicted_winner_team_id`, `confidence_level`.

### 1.6 `league_match_scores` — **column names corrected (S10, U7)**

Exists because of a hard blocker, not a preference: `shadow_match_scores_match_id_fkey` is `FOREIGN KEY (match_id) REFERENCES matches(match_id) ON DELETE CASCADE`. A league fixture that is not in `matches` physically cannot be inserted there.

```sql
CREATE TABLE league_match_scores (
  entry_id             uuid    NOT NULL REFERENCES pool_entries(entry_id)      ON DELETE CASCADE,
  fixture_id           uuid    NOT NULL REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  pool_id              uuid    NOT NULL REFERENCES pools(pool_id)              ON DELETE CASCADE,
  matchweek_number     integer NOT NULL,
  fixture_number       integer NOT NULL,
  kicked_off_at        timestamptz NOT NULL,
  score_type           text    NOT NULL,
  base_points          integer NOT NULL,   -- S10: the reader expects it; = total_points here
  total_points         integer NOT NULL,   -- S10: NOT `points`. Five readers name total_points
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

`pool_id` is denormalised because `pool_entries` has no `pool_id` — the same reason `shadow_match_scores` carries it.

The `score_type` CHECK is the **identical four-value vocabulary** as `shadow_match_scores_score_type_check`. Every downstream consumer buckets on those strings (`analyticsHelpers.ts:22-32`, `xpSystem.ts:138-145`, `lib/push/badges.ts:402-480`, migration 037). A league cannot invent a fifth outcome without a cross-cutting change, and it does not need one.

v1 named the points column `points` while §1.7 argued that column names are load-bearing. That inconsistency is what S10 caught, and `base_points` is what U7 caught. Both are now columns, and the full read-boundary synthesis is enumerated in §6.2 rather than left to an implementer's reading of a prose list.

Still omitted and synthesised at the read boundary: `multiplier` (1), `pso_points` (0), `teams_match` (true), `predicted_home_team_id` / `predicted_away_team_id` (NULL), `predicted_*_pso` / `actual_*_pso` (NULL). Storing five columns of constants on 380 × N rows is the World-Cup-furniture mistake in miniature.

### 1.7 `league_entry_totals` — and the broadcast trigger correction (**N2, CRITICAL**)

```sql
CREATE TABLE league_entry_totals (
  entry_id            uuid PRIMARY KEY REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  pool_id             uuid    NOT NULL REFERENCES pools(pool_id) ON DELETE CASCADE,
  match_points        integer NOT NULL DEFAULT 0,
  bonus_points        integer NOT NULL DEFAULT 0,
  point_adjustment    integer NOT NULL DEFAULT 0,   -- N2: mirrored, so the broadcast can emit it
  total_points        integer NOT NULL DEFAULT 0,   -- match + bonus + point_adjustment
  final_rank          integer,
  previous_final_rank integer,
  exact_count         integer NOT NULL DEFAULT 0,
  correct_count       integer NOT NULL DEFAULT 0,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_let_pool ON league_entry_totals(pool_id);
```

The first seven column names are not a style choice — they are the identifiers `broadcast_pool_leaderboard()` dereferences off its transition table. Match them and the realtime leaderboard is inherited; change one and the trigger raises at runtime.

**But v1's headline claim #1 is wrong, and this is the finding I would not have found without dumping the live body.** `pg_get_functiondef('public.broadcast_pool_leaderboard()')`, read live:

```sql
jsonb_build_object(
  'entry_id',      n.entry_id,
  'match_points',  n.match_points,
  'bonus_points',  n.bonus_points,
  'total_points',  n.total_points,      -- <-- not scored_total_points
  'current_rank',  n.final_rank,
  'previous_rank', n.previous_final_rank
)                                        -- <-- no point_adjustment at all
```

The client types that payload as `LiveEntry[]` at `app/pools/[pool_id]/PoolDetail.tsx:769-772`. `LiveEntry` is declared at `app/api/pools/[pool_id]/live/route.ts:32-40` as `{entry_id, match_points, bonus_points, point_adjustment, scored_total_points, current_rank, previous_rank}`, and `mergeMembers` at `app/pools/[pool_id]/liveMerge.ts:76-97` compares **all six** and then writes all six.

So on every broadcast:
- `entry.point_adjustment === update.point_adjustment` → `N === undefined` → false → `memberChanged`
- `entry.scored_total_points === update.scored_total_points` → `N === undefined` → false → `memberChanged`
- the merge then writes `point_adjustment: undefined, scored_total_points: undefined` into the entry.

**The leaderboard total blanks out on every live broadcast.** This is live today with `leaderboard_broadcast_enabled = true`. It has never been seen because the World Cup finished before this shipped: all 104 matches are complete, `shadow_finalize_totals` writes diff-aware, so no row ever reaches the transition table. Memory already records this exact hazard — *"the /live merge CAN'T be verified until a match goes live."*

**The Premier League's first kickoff, 2026-08-21 19:00Z, is the first time this code path executes with real data in production.** Under the design as v1 wrote it, the very first goal of the season blanks every watching member's points.

**Fix — a shared-function edit, taken deliberately (D2 below):**

```sql
CREATE OR REPLACE FUNCTION broadcast_pool_leaderboard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r record;
BEGIN
  -- W10: per-table switch, falling back to the existing global key so current
  -- behaviour is byte-identical until someone sets the specific key.
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'leaderboard_broadcast_enabled_' || TG_TABLE_NAME),
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'leaderboard_broadcast_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN RETURN NULL; END IF;

  FOR r IN
    SELECT n.pool_id,
           jsonb_agg(jsonb_build_object(
             'entry_id',            n.entry_id,
             'match_points',        n.match_points,
             'bonus_points',        n.bonus_points,
             -- N2: both names emitted. `total_points` retained so nothing that
             -- reads the old key breaks; `scored_total_points` added because
             -- that is what LiveEntry and liveMerge actually compare.
             'total_points',        n.total_points,
             'scored_total_points', n.total_points,
             'point_adjustment',    n.point_adjustment,
             'current_rank',        n.final_rank,
             'previous_rank',       n.previous_final_rank
           ) ORDER BY n.final_rank) AS entries
    FROM new_rows n WHERE n.pool_id IS NOT NULL GROUP BY n.pool_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('pool_id', r.pool_id, 'entries', r.entries),
      'leaderboard_update', 'pool:' || r.pool_id::text || ':leaderboard', true);
  END LOOP;
  RETURN NULL;
END; $$;
```

`shadow_entry_totals` has no `point_adjustment` column, so the function is written to read it off the transition table — which means **`shadow_entry_totals` needs a `point_adjustment integer NOT NULL DEFAULT 0` column added and populated by `shadow_finalize_totals`** for the World Cup arm, or the reference raises. The cheaper, freeze-respecting alternative is a `COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)` derivation, which is exactly what `readEntryScoring` already does at `lib/scoring/readSource.ts:170-172`. **v2 takes the derivation** — zero DDL on a World Cup table, and it reproduces the number the read path already reports.

Then attach:

```sql
CREATE TRIGGER broadcast_pool_leaderboard_ins AFTER INSERT ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();
CREATE TRIGGER broadcast_pool_leaderboard_upd AFTER UPDATE ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();
```

`total_points` folds `point_adjustment` because `readEntryScoring` reconstructs it as `tp - mp - bp`. `exact_count` / `correct_count` are stored (where `shadow_entry_totals` recomputes them in a CTE) because they are the rank tiebreak inputs and storing them makes a rank-only recompute cheap and auditable.

### 1.8 `league_fixture_state` — the reconciler's diff mirror

```sql
CREATE TABLE league_fixture_state (
  fixture_id   uuid PRIMARY KEY REFERENCES league_fixtures(fixture_id) ON DELETE CASCADE,
  home_goals   integer, away_goals integer,
  status       text,    is_completed boolean,
  scored_at    timestamptz NOT NULL DEFAULT now()
);
```

Exactly `shadow_match_state`'s role, own table.

### 1.9 Not created in v1: `league_bonus_scores`

A league pool writes zero bonus rows; `league_entry_totals.bonus_points` is a stored `0`; the reader returns `[]`. `bonus_category` and `related_group_letter` are bracket vocabulary, and Final Table is not in v1. Creating an empty table now invites a writer nobody designed. When Final Table lands it gets `league_bonus_scores(entry_id, pool_id, bonus_type, related_matchweek_id, points_earned, description)` with `UNIQUE (entry_id, bonus_type, related_matchweek_id)` — the four-part uniqueness `readSource.ts:274` needs for its synthesised React key.

### 1.10 RLS and league triggers

| Object | RLS |
|---|---|
| `league_seasons`, `league_clubs`, `league_matchweeks`, `league_fixtures` | RLS on, one `SELECT USING (true)` — mirrors the live `matches` / `teams` policies |
| `league_predictions` | RLS on, **four policies transcribed from `predictions`** (own-select, admin-select, insert, update) with `entry_id` repointed. The `pe.predictions_locked = false AND po.archived_at IS NULL` conditions carry over unchanged. ⚠ The audit's last line is right: deny-all is what mobile's anon client hits, and both the empty read and the 400 on write are discarded — so these four policies are launch-blocking, not hardening |
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

-- Cross-competition guard. This one RAISES: it is a programming error, not a race.
CREATE FUNCTION assert_league_prediction_pool() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pool_entries pe
      JOIN pool_members pm   ON pm.member_id = pe.member_id
      JOIN pools po          ON po.pool_id   = pm.pool_id
      JOIN league_fixtures f ON f.fixture_id = NEW.fixture_id
     WHERE pe.entry_id = NEW.entry_id AND po.league_season_id = f.season_id
  ) THEN
    RAISE EXCEPTION 'league_predictions: entry % is not in a pool playing this fixture''s season', NEW.entry_id;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

**The matchweek-window trigger — corrected from v1's sketch.** v1 wrote it as an `UPDATE … FROM (SELECT … GROUP BY matchweek_id)`, which INNER-joins: a matchweek that just lost its last fixture vanishes from the aggregate and is never updated, so `fixture_count` stays stale-nonzero forever. LEFT JOIN from the matchweek side:

```sql
CREATE OR REPLACE FUNCTION refresh_league_matchweek_window() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE league_matchweeks mw SET
    first_kickoff_at        = agg.first_k,
    last_kickoff_at         = agg.last_k,
    fixture_count           = COALESCE(agg.n, 0),
    completed_fixture_count = COALESCE(agg.done, 0),
    lock_at    = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now()
                      THEN agg.first_k ELSE mw.lock_at END,
    updated_at = now()
  FROM league_matchweeks m2
  LEFT JOIN LATERAL (
    SELECT min(f.kickoff_at) first_k, max(f.kickoff_at) last_k,
           count(*) n, count(*) FILTER (WHERE f.is_completed) done
      FROM league_fixtures f WHERE f.matchweek_id = m2.matchweek_id
  ) agg ON true
  WHERE mw.matchweek_id = m2.matchweek_id
    AND (mw.first_kickoff_at, mw.last_kickoff_at, mw.fixture_count, mw.completed_fixture_count)
        IS DISTINCT FROM (agg.first_k, agg.last_k, COALESCE(agg.n,0), COALESCE(agg.done,0));
  RETURN NULL;
END; $$;
-- AFTER INSERT OR UPDATE OF kickoff_at, is_completed OR DELETE
--   ON league_fixtures FOR EACH STATEMENT
```

---

## 2. The one touch on `pools`

### 2.1 Three options, measured

| | Mechanism | Cost against "the World Cup structure is frozen" |
|---|---|---|
| **A. Nullable second FK** | `pools.league_season_id`, `tournament_id` loses `NOT NULL`, CHECK enforces exactly-one | One added column, one dropped `NOT NULL`, one CHECK. No data change — all 624 existing rows already satisfy it. FK integrity preserved on both arms. **Risk:** nullable `tournament_id` turns ~50 `.eq('tournament_id', …)` sites into silent-empty, because `.eq(col, null)` renders `col=eq.null` and returns zero rows without erroring |
| **B. Polymorphic `(competition_kind, competition_id)`** | Two columns, no FK possible | Loses referential integrity on **both** competitions; `pools_tournament_id_fkey` dropped, so a deleted tournament orphans pools silently. Requires rewriting every existing `tournament_id` read even for World Cup pools. **Reject** |
| **C. Bridging table** | `pools` literally untouched | `pools.tournament_id` stays `NOT NULL`, so a league pool must still point at a `tournaments` row — exactly the World Cup furniture the decision removes. Re-arms `loadSyncTargets`, `matches_stage_check` and the unscoped `teams` read. **Reject: the current mess with an extra join** |

### 2.2 Recommendation: A, with the nullability risk closed by the type system

```sql
ALTER TABLE pools ADD COLUMN league_season_id uuid REFERENCES league_seasons(season_id);
ALTER TABLE pools ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE pools ADD CONSTRAINT pools_exactly_one_competition CHECK (
  (tournament_id IS NOT NULL AND league_season_id IS NULL) OR
  (tournament_id IS NULL     AND league_season_id IS NOT NULL));
CREATE INDEX idx_pools_league_season ON pools(league_season_id) WHERE league_season_id IS NOT NULL;

ALTER TABLE pools ADD COLUMN league_start_matchweek integer
  CHECK (league_start_matchweek IS NULL OR league_start_matchweek BETWEEN 1 AND 60);
COMMENT ON COLUMN pools.league_start_matchweek IS
  'First matchweek this pool plays. NULL = derive from pools.created_at.';
```

`pools_tournament_id_fkey` survives; every World Cup pool's row is byte-identical; `DROP NOT NULL` does not rewrite the table.

The freeze is a promise about *World Cup behaviour*, not about the DDL text of shared tables. `pools` is explicitly in the shared layer, and a nullable column that is NULL on all 623 World Cup rows changes nothing a World Cup pool does. A bridging table that forces a fake `tournaments` row changes what the World Cup's own ingest, stage CHECK and team list see — a bigger hole wearing a smaller hat.

### 2.3 The safeguard

`PoolData` (`app/pools/[pool_id]/types.ts`) drops `tournament_id` and gains `competition: CompetitionRef`. Every one of the ~50 `pool.tournament_id` reads becomes a compile error; `next.config.ts` already fails the build on type errors. The compiler, not a reviewer, produces the exhaustive list of competition-scoped readers.

Explicitly **not** added: no `competition_kind` discriminator column. `pools.prediction_mode = 'league_pickem'` (already in `pools_prediction_mode_check`, verified live) plus the exactly-one CHECK make a third column redundant.

**W9's correction is taken:** L3's acceptance gate is a captured response diff, not `npm run build`. §11.

---

## 3. Round state machine — **derived, not stored** (S3)

v1 omitted this entirely. It is the section that decides whether the season advances past week one.

### 3.1 The decision

**A league pool holds ZERO `pool_round_states` rows.** Matchweek state is a pure function of the season calendar, computed in SQL at read time.

### 3.2 The argument for storing rows, steelmanned then answered

1. *Ten-odd consumers read `pool_round_states` directly, two in Expo* — `mobile/lib/useHomeData.ts:366-369`, `mobile/components/pool-detail/PoolInfoTab.tsx:466`, plus `app/pools/[pool_id]/page.tsx:89`, `bulk/route.ts`, `predictions/unlock`, `entries/[entry_id]/predictions`, `send-pending-reminders:137`, `send-template:89,394,583`, `admin/pools/[id]/route.ts:85`. With no rows they return `[]` — the codebase's signature silent-empty. **This is the single real cost and I am not minimising it.** Answered by serving the derivation through a function with identical column names and routing every reader through one `lib/rounds/read.ts` — the same adapter mechanism §6.4 chose for predictions. The two mobile sites need an OTA (§10).
2. *`opened_by` audit trail.* For a league nobody opens anything.
3. *Admin deadline override.* Real in the World Cup — 240/201/262 pools carry an identical hand-set deadline for final / round_16 / semi_final, i.e. one super-admin bulk decision, not 250 individual ones. But a league's deadline is `min(kickoff)` of the matchweek, which is **already what the live DB trigger enforces**. A stored deadline that disagrees with the trigger produces either a UI that closes early while the DB still accepts picks, or an "open" matchweek whose saves vanish with no error. **Storing the deadline creates a two-gate disagreement that derivation cannot have.**
4. *Cost of 38 rows × every pool.* Not the row count. It is 38 × N **transitions**, each of which a cron must get right.

### 3.3 The argument against, on measured evidence

**(a) The cascade already fails at 15% over seven rounds.** Verified live today, a month after the final: **121 `pool_round_states` rows across 42 of 281 progressive pools are still `state='locked'`** — quarter_final 27, round_16 25, third_place 23, final 21, round_32 14, group 7, semi_final 4. Seven pools' `group` round never opened at all. That is the exact failure mode, already in production, over 7 rounds. A league has 38.

**(b) "Games in hand" structurally deadlock a completion-gated cascade.** `autoCompleteProgressiveRounds` (`lib/auto-submit.ts:429-430`) advances only when `roundMatches.every(m => m.is_completed)`, and only from `in_progress`, which only `autoSubmitProgressiveRounds` sets (`:346-352`), which only fires on a non-null past deadline (`:206-211`). Postpone one MW7 fixture to April — routine in the Premier League — and MW7 never completes, so MW8…MW38 never open. A knockout round genuinely cannot be played out of order; **for a league, out-of-order completion is a normal feature of the season.**

**(c) The cascade has a hard 1,000-pool ceiling that presents as "the matchweek never opened".** `lib/auto-submit.ts:206-211` and `:385-388` both select across all pools with no `.range()` and no `.limit()`. A World Cup pool has at most one open round and they staggered; a league pool has exactly one open matchweek and **every pool crosses its deadline at the same instant** (Saturday 12:30). At 1,000+ league pools PostgREST truncates silently and the tail never transitions.

**(d) The reason the World Cup needs a cascade does not exist in a league.** A knockout fixture has no teams until the previous round resolves — hence `allTeamsAssigned` at `lib/auto-submit.ts:492` and the state-route guard at `rounds/[round_key]/state/route.ts:103-120`. All 380 Premier League fixtures exist with real club names in August. There is nothing to wait for, so nothing to make an actor responsible for.

**(e) Mid-season creation stops being a special case.** 45 of 281 World Cup progressive pools (16%) were created after the first kickoff; `lib/poolRoundStates.ts:105-150` handles this with a careful `completed`/`open`/`locked` seeding branch. Derived, the same rule falls out of the calendar with no branch and no code.

**(f) It is cheaper.** Derivation reads 38 pre-aggregated `league_matchweeks` rows that are **per-season**, shared by every pool — versus 38 rows per pool read separately. With reads at 70.3% of DB time (`project_scalable_architecture`), that is a material win.

### 3.4 The function

Same seven column names and the same four-value state vocabulary as `pool_round_states`, so the reused UI needs no component change.

```sql
CREATE FUNCTION league_round_states(p_pool_id uuid)
RETURNS TABLE (
  pool_id uuid, round_key text, state text, deadline timestamptz,
  opened_at timestamptz, closed_at timestamptz, completed_at timestamptz,
  match_count integer, completed_match_count integer, matchweek_number integer
) LANGUAGE sql STABLE AS $$
  WITH p AS (
    SELECT po.pool_id, po.league_season_id, po.created_at, po.league_start_matchweek
      FROM pools po WHERE po.pool_id = p_pool_id AND po.league_season_id IS NOT NULL
  ),
  s AS (
    SELECT p.*, COALESCE(
      p.league_start_matchweek,
      (SELECT min(mw.matchweek_number) FROM league_matchweeks mw
        WHERE mw.season_id = p.league_season_id
          AND mw.fixture_count > 0 AND mw.lock_at > p.created_at),
      -- A pool created after the last lock plays nothing. Sentinel, not NULL:
      -- a NULL start_mw makes every comparison NULL and the CASE falls to
      -- 'in_progress' for all 38 — a plausible-looking wrong answer.
      (SELECT ls.matchweek_count + 1 FROM league_seasons ls WHERE ls.season_id = p.league_season_id)
    ) AS start_mw FROM p
  ),
  o AS (
    -- The open matchweek is the one that LOCKS SOONEST, not the lowest-numbered.
    -- This is what makes a postponement non-blocking: MW8 opens on its own lock,
    -- regardless of whether MW7 ever completed.
    SELECT (SELECT mw.matchweek_number FROM league_matchweeks mw, s
             WHERE mw.season_id = s.league_season_id
               AND mw.fixture_count > 0 AND mw.lock_at > now()
               AND mw.matchweek_number >= s.start_mw
             ORDER BY mw.lock_at, mw.matchweek_number LIMIT 1) AS open_mw
  )
  SELECT s.pool_id,
         'mw_' || mw.matchweek_number,
         CASE
           WHEN mw.matchweek_number < s.start_mw               THEN 'completed'
           WHEN mw.fixture_count = 0                           THEN 'locked'
           WHEN mw.matchweek_number = o.open_mw                THEN 'open'
           WHEN mw.lock_at > now()                             THEN 'locked'
           WHEN mw.completed_fixture_count >= mw.fixture_count THEN 'completed'
           ELSE 'in_progress'
         END,
         mw.lock_at,                                                   -- deadline
         CASE WHEN mw.matchweek_number >= s.start_mw
              THEN GREATEST(s.created_at, COALESCE(
                     (SELECT p2.lock_at FROM league_matchweeks p2
                       WHERE p2.season_id = mw.season_id
                         AND p2.matchweek_number < mw.matchweek_number
                       ORDER BY p2.matchweek_number DESC LIMIT 1), s.created_at))
         END,                                                          -- opened_at
         CASE WHEN mw.lock_at <= now() THEN mw.lock_at END,            -- closed_at
         CASE WHEN mw.fixture_count > 0
               AND mw.completed_fixture_count >= mw.fixture_count
              THEN mw.last_kickoff_at END,                             -- completed_at
         mw.fixture_count, mw.completed_fixture_count, mw.matchweek_number
    FROM league_matchweeks mw, s, o
   WHERE mw.season_id = s.league_season_id
   ORDER BY mw.matchweek_number;
$$;
```

Note what the four states now mean for a league:
- `open` — the soonest-locking future matchweek at or after the pool's start. Exactly one.
- `locked` — a future matchweek that is not the open one, or an empty one.
- `in_progress` — locked and some fixtures unplayed. **A postponed fixture parks its matchweek here indefinitely, harmlessly.**
- `completed` — every fixture played, or before the pool joined.

### 3.5 One reader, and two files disposed of

```ts
// lib/rounds/read.ts — the only place either shape is read.
export async function readRoundStates(admin, poolId, ref: CompetitionRef): Promise<RoundState[]>
```

For `ref.kind === 'league'` it RPCs `league_round_states(poolId)`; otherwise it selects `pool_round_states`. Same row shape both ways. The ten direct readers listed in §3.2 route through it. An ESLint `no-restricted-syntax` rule confines `.from('pool_round_states')` to `lib/rounds/`.

- **`lib/competitionRounds.ts` — RETAIN, with surgery.** It is pure, has 23 unit tests, touches no table. `matchweekKey` / `matchweekNumber` (strict `mw_N` parsing — a key that round-trips differently creates two rows for one matchweek), `sortRoundKeys` (numeric ordering — lexically `mw_10` precedes `mw_2` and matchweeks render in the wrong order, verified at `lib/competitionRounds.ts:184-201`), `roundLabel` / `roundShortLabel`, `usesRounds` (`:222`), `usesBracket` (`:227`) all earn their place. **Delete** `leagueRoundDefs` and `roundDefsFor` (`:105-126`) — they take `RoundableMatch[]`, the `matches`-table shape the fork removes — and make `nextRoundKey` (`:176`) bracket-only, since a league has no successor concept once nothing "opens".
- **`lib/roundMatches.ts` — DELETE.** Its whole body is `.from('matches').eq('tournament_id',…)` with a `stage='regular_season' AND round_number=N` arm at `:33-47`. League fixtures live behind `matchweek_id`, so that arm is unreachable by construction, and what remains is a World Cup stage query with a league branch bolted on. Preserve its one durable idea — *return the error rather than an empty list* (`:44`) — in the bracket-only replacement, and **stop discarding it at `lib/auto-submit.ts:262`, `:570` and `rounds/[round_key]/state/route.ts:298`** (S4). An empty round at those three sites is never a valid answer.

### 3.6 What is deleted, and what nothing replaces

- `autoSubmitProgressiveRounds`, `autoCompleteProgressiveRounds`, `sendAutoRoundOpenNotifications` — **untouched, and naturally league-free**, because they select from `pool_round_states` and a league pool has no rows there. Add `.is('league_season_id', null)` to their pool selects anyway, with a logged skip count, so the exclusion is stated rather than incidental.
- `rounds/route.ts:37` and `rounds/[round_key]/state/route.ts:69` — **keep the `!== 'progressive'` gate as-is.** For a league there is nothing to open, so refusing is correct. Change only the error message so an admin is told *why*: `"matchweek state is derived from the fixture calendar and cannot be set"`.
- Matchweek-open notification: a **per-season** cron reading `league_matchweeks.open_notified_at`, fanning out to every pool of that season in one pass — not 38 × N per-pool transitions.

### 3.7 The one thing that must be deleted from live data

The existing league pool's 38 `pool_round_states` rows. Left in place they would shadow the derivation at every reader that has not yet been routed through `readRoundStates`, and they would hold `mw_*` keys in a table the World Cup owns.

---

## 4. Prediction lifecycle

### 4.1 The lock

`enforce_league_prediction_before_lock` (§1.10), a BEFORE trigger with a silent skip. Silent because mobile writes predictions directly to PostgREST and a RAISE surfaces as an opaque failure the user never sees.

**The trade-off, stated:** a silent skip *is itself* a silent-empty. It is only acceptable because the UI shows the matchweek as `locked` before a member can hit it (§3.4 guarantees `state='locked'` the instant `lock_at <= now()`), and because the alternative — a RAISE inside a batched mobile upsert — aborts the whole statement.

### 4.2 There is no post-lock edit, and that is a real simplification

`app/api/cron/shadow-materialize` `:82` / `:91` are watermark detectors over `predictions.updated_at`, needed because a World Cup prediction could change after its match was scored. **The league needs no equivalent at all:** the lock precedes the matchweek's first kickoff, so a league prediction can never change after its fixture is scored. Record this as a deliberate omission, not an oversight.

### 4.3 Refused loudly

| Site | Treatment |
|---|---|
| `predictions/route.ts:358` PUT all-at-once submit | `409 {error: 'league pools submit per matchweek'}` — never the current misleading `Not all matches predicted. 0/380 completed.` |
| `bonus/calculate/route.ts:143` | `400`. Note `:166` bulk-deletes bonus rows *before* `:181`'s `continue`, so running it is destructive |
| `lib/auto-submit.ts:103` `autoSubmitDraftEntries` | Excluded with `.is('league_season_id', null)` + logged skip count. A league pool has no single pool-wide deadline; `pools.prediction_deadline` is meaningless for it |

---

## 5. The scoring engine

### 5.1 Where it lives: SQL only

Backend computes once and stores; front ends only display; aggregates in SQL. Writing the league engine in Node *and* in SQL would recreate the hand-fork that made prod↔shadow parity worthless — memory's *"parity is not an oracle."*

`lib/scoring/recalculate.ts` is the enforcement point, corrected per W1:

```ts
const { data: pool } = await adminClient.from('pools')
  .select(`pool_id, prediction_mode, ${COMPETITION_COLUMNS}`)   // <-- widened
  .eq('pool_id', poolId).single()

const ref = competitionRef(pool)              // throws if the select was narrowed
const isLeaguePool = ref.kind === 'league'
```

And per S5, the early return no longer lies:

```ts
if (isLeaguePool) {
  return { success: false, poolId, predictionMode: pool.prediction_mode,
           entriesProcessed: 0, matchScoresWritten: 0, bonusScoresWritten: 0,
           error: 'league pools are scored by league_rescore_pool — route did not dispatch' }
}
```

A league pool should never reach `recalculatePool` at all once §5.5 lands. If it does, an admin sees a failure rather than a success toast beside an unmoved total.

### 5.2 `league_score_fixture(p_fixture_id uuid, p_final boolean)`

Per `(entry, fixture)`:

**Eligibility — corrected (S4).** The entry's pool has `league_season_id = fixture.season_id`; **a `league_predictions` row exists**; the fixture has both goals; `is_completed OR (NOT p_final AND status='live')`.

> **v1 said eligibility requires an `entry_round_submissions` row with `has_submitted`. v2 removes the submission gate from scoring entirely.**
>
> A stored league prediction *is* a submitted one, because `enforce_league_prediction_before_lock` makes a post-lock write impossible and predictions are only ever written by an explicit member save — verified: `app/api/pools/[pool_id]/predictions/round/route.ts:129-152` writes only `entry_round_submissions`; the score rows come from a separate PUT. There is no draft auto-fill in the database.
>
> This dissolves S4's compound failure at the root. Under v1's gate, a member who made every pick but never pressed Submit scored **zero** for the matchweek — because the auto-submit sweep that would have written the submission row was itself broken by `fetchRoundMatches`. With no gate, that member scores normally and the whole `fetchRoundMatches`-error-discard chain stops being load-bearing for points.
>
> `entry_round_submissions` and `pool_entries.has_submitted_predictions` are still written by the manual Submit route — they are UI affordances ("submitted" chips, half the app reads the flag). They are **explicitly not scoring inputs**. Say so in the migration header, because the World Cup's whole eligibility vocabulary is the other way round.

**`score_type`:** `exact` → both goals right; `winner_gd` → right outcome and right goal difference; `winner` → right outcome; else `miss`. **No `teams_match` gate** — a league fixture names its own teams. That gate is the whole content of the bug that makes a league pool score zero today.

**Points:** the flat base from `pool_settings.group_exact_score / group_correct_difference / group_correct_result` (canonical 100/75/50), `COALESCE`d to `5/3/1`. **No multiplier, no PSO.** `base_points = total_points` on the row.

**Writes:** diff-aware upsert into `league_match_scores` — `ON CONFLICT (entry_id, fixture_id) DO UPDATE … WHERE … IS DISTINCT FROM` over `score_type, total_points, actual_home_score, actual_away_score`.

### 5.3 `league_finalize_totals(p_pool_ids uuid[])`

- Aggregates `league_match_scores` per entry → `match_points`, `exact_count`, `correct_count` (non-miss).
- `bonus_points = 0` (v1, §1.9).
- `point_adjustment` copied from `pool_entries.point_adjustment`; `total_points = match_points + bonus_points + point_adjustment` — the fold is mandatory because `readEntryScoring` reconstructs the adjustment as `tp - mp - bp` (`lib/scoring/readSource.ts:170-172`).
- **Rank:** the canonical cascade, unchanged and correct for a league as-is:
  `RANK() OVER (PARTITION BY pool_id ORDER BY total_points DESC, exact_count DESC, correct_count DESC, bonus_points DESC, predictions_submitted_at ASC NULLS LAST)`.
  `final_rank` is stored and the parity alarm compares totals only, so rank must be right at write time.

> **N7 — the tiebreaker moves.** `predictions_submitted_at` is set only by the manual Submit route (`predictions/round/route.ts:169-173`), on the entry's first-ever submission. With no submission gate, a member who never presses Submit has it NULL and sorts **last** on every tiebreak, all season, silently. **The league prediction write path must set `predictions_submitted_at` on the entry's first saved prediction** (`.is('predictions_submitted_at', null)`), not on submit. Nobody flagged this because nobody proposed removing the gate.

- **Writes** to `league_entry_totals`, diff-aware (`WHERE match_points/bonus_points/point_adjustment/total_points/final_rank IS DISTINCT FROM EXCLUDED`). Diff-awareness is load-bearing: the broadcast trigger uses the statement's `NEW` transition table, and `PoolDetail.tsx:754` explicitly depends on unchanged rows never reaching it.
- **Then mirrors** into `pool_entries.{match_points, bonus_points, scored_total_points, current_rank}` in the same transaction (D6).

### 5.4 Reaching the leaderboard without forking it

1. **Realtime push** — `broadcast_pool_leaderboard()` attached to `league_entry_totals`, *after the N2 correction* (§1.7). Same topic, same client subscription, same `liveMerge.ts`.
2. **Server read** — `readEntryScoring` gains a `'league'` source arm; its eight consumers are untouched.
3. **Direct `pool_entries` readers** — covered by the mirror.
4. **XP / badges / analytics** — see §5.6. This is where v1 was a no-op.

### 5.5 The drain, and the entry-side recompute v1 had no answer for (S5)

```
cron league-reconcile  (* * * * *)   SELECT public.league_reconcile_fixtures();
cron league-snapshot   (* * * * *)   SELECT public.league_snapshot_ranks();
```

`league_reconcile_fixtures()` mirrors `shadow_reconcile_matches`: advisory lock on a **distinct** key (`league_process_queue`, not `shadow_process_queue` — the two engines must not serialise against each other), diff `league_fixtures` against `league_fixture_state`, `league_score_fixture` each, `league_finalize_totals(affected pools)`, upsert the state mirror, then fire XP/badges for the affected pools.

`league_snapshot_ranks()` copies `final_rank → previous_final_rank` when a matchweek's first fixture goes live. Without it the ▲/▼ indicator and the Biggest Climber / Biggest Faller superlatives (`leaderboard/route.ts:294-298`) read zero forever.

**Fixture-diffing is not enough (S5).** Nothing that changes an *entry* — a point adjustment, a member leaving, an entry deleted, a scoring price change — triggers a recompute. v1 kept `recalculatePool`'s early return *and* disarmed `shadow_reconcile_adjustments` with the §7 containment predicate, leaving no backstop at all. Verified callers: `admin/MembersTab.tsx:314` (remove member), `:346` (delete entry), `:402-410` (point adjustment), `admin/ScoringTab.tsx:700` (price change), `PoolDetail.tsx:739` (leave pool), plus mobile's `SettingsTab.tsx:261` and `PoolInfoTab.tsx:77`.

**v2 adds:**

```sql
-- Full re-score of one pool. Prices, adjustments, membership — everything.
CREATE FUNCTION league_rescore_pool(p_pool_id uuid) RETURNS void ...
--   for each completed/live fixture of the pool's season: league_score_fixture
--   then league_finalize_totals(ARRAY[p_pool_id])
```

`POST /api/pools/[pool_id]/recalculate` dispatches on `CompetitionRef`: league → `league_rescore_pool`, World Cup → `recalculatePool`. One `if` at one call site.

And a durable backstop for the one path that has no route behind it:

```sql
CREATE TRIGGER trg_league_adjustment_rescore
  AFTER UPDATE OF point_adjustment ON pool_entries
  FOR EACH ROW WHEN (OLD.point_adjustment IS DISTINCT FROM NEW.point_adjustment)
  EXECUTE FUNCTION league_rescore_on_adjustment();   -- no-ops unless the pool is a league
```

This is a second touch on a shared table's triggers (D3). It is provably inert for all 623 World Cup pools because its first statement is the league test.

### 5.6 XP and badges — `lib/push/badges.ts` needs surgery, not repointing (S2, S7)

Three separate defects in one file, all verified:

| Line | Defect | Fix |
|---|---|---|
| `badges.ts:89-91` | `.select('pool_id, pool_name, tournament_id')` then `if (!tournamentId) return`. Under option A this is NULL for every league pool. **This function is the only writer of `entry_xp_state` (`:221`) and the only caller of `computePoolEntryAnalytics` (`:156`)** | Widen the select to `COMPETITION_COLUMNS`, take a `CompetitionRef`, delete the guard. The `tournament_id` is used only at `:132-135` to fetch matches for stage/group lookups — fetch `league_fixtures` instead |
| `badges.ts:376` | `const scoreTable = (await isProdScoringEnabled(admin)) ? 'match_scores' : 'shadow_match_scores'` — a **third** score-table mechanism, independent of `getScoringSource` and of the allowlist. Never reads `league_match_scores` | Select the table from the same `getScoringSource(ref)` decision as everything else |
| `badges.ts:453` | `lightning_rod` = `predictionCount > 0 && predictionCount >= matches.length`. With `matches` empty for a league, **everyone earns it after their first matchweek** — and `badge_unlocks` is append-only, so it cannot be taken back | Denominator becomes the season's fixture count |

Without `badges.ts` fixed, `app/api/pools/[pool_id]/leaderboard/route.ts:201-202` gates `matchPoints` / `bonusPoints` on the `entry_xp_state` row existing — so a league pool renders **"Total 450 pts" beside "Match 0 / Bonus 0"**, plus empty form dots, 0% hit rate, Level 1 for everyone all season. Every value is plausible; nothing errors. `xp_rows = eligible_entries` therefore moves into **L5's** exit criteria.

`lib/analytics/entryAnalytics.ts` remains the single owner of `entry_xp_state`; only its two input reads (`:70-77` matches, `:112-132` predictions) repoint, via the adapters.

**And the XP rules themselves are bracket-shaped (U3).** `xpSystem.ts:336` and `:498` express "not a knockout match" as `stage === 'group'`. A synthesised `regular_season` is not `'group'`, so **every non-miss league prediction fires the +25 Knockout King bonus** — up to ~380 phantom events per entry per season, inflating `total_xp` and `current_level` on the shared leaderboard and in Banter member levels (`CommunityTab.tsx:261`). This is the one finding that is silently *wrong* rather than silently empty. Invert both to a positive knockout test (`BRACKET_KNOCKOUT_STAGES` at `lib/competitionFormat.ts:43` already exists) so an unrecognised stage awards nothing rather than everything.

---

## 6. The read path

### 6.1 Collapsing source selection to one door (S6, N1, N3)

`getScoringSource` is not the single gate v1 assumed. **Eight non-test callers read `getShadowReadPools` directly** and bucket pools themselves:

`app/pools/page.tsx:143` · `app/dashboard/page.tsx:204` · `app/profile/page.tsx:87` · `app/api/admin/pools/[id]/route.ts:108` · `app/api/admin/users/[id]/route.ts:146` · `app/api/users/[user_id]/activity/route.ts:601` · `app/api/users/[user_id]/home-scoring/route.ts:125` · **`scripts/verify-read-paths.ts:53`**

That last one is N3 and it matters most: the verification script memory says to run before enabling any pool is itself built on the bypass, so it can never see a league pool. A green run from it would be exactly the "plausible wrong answer" the house rule forbids.

A league pool is not in `shadow_read_enabled_pools`, so every one of these buckets it into `prodIds`, scans `match_scores`, finds nothing, and treats the empty result as a legitimate zero summary. The RN home screen shows the correct total (rescued by the D6 mirror) beside `total_completed 0`, exact 0, streak 0, empty form dots — **verbatim the failure memory records as "RN home screen's form/accuracy/streak were dead this way."**

**v2:**
```ts
export async function getScoringSource(
  admin: AdminClient, poolId: string, ref: CompetitionRef,
): Promise<ScoringSource> {                      // 'league' | 'shadow' | 'prod'
  if (ref.kind === 'league') return 'league'
  const pools = await getShadowReadPools(admin)
  return pools.has(poolId) ? 'shadow' : 'prod'
}
```
- The `predictionMode === 'league_pickem'` line at `readSource.ts:88` is **deleted** — mode is not competition.
- `getShadowReadPools` becomes module-private. A CI assertion enforces exactly one caller.
- All eight sites route through `getScoringSource` per pool.
- `scripts/verify-read-paths.ts` gains a league fixture and asserts non-empty.

### 6.2 `readMatchScores` league arm — all 22 keys, named (U7, S10)

`MATCH_SCORE_SHARED_COLS` (`lib/scoring/readSource.ts:210-215`) declares 22 fields. The league arm reads `league_match_scores` and emits, explicitly:

| Key | Source |
|---|---|
| `entry_id`, `pool_id`, `score_type`, `total_points`, `base_points`, `predicted_home_score`, `predicted_away_score`, `actual_home_score`, `actual_away_score`, `calculated_at` | stored |
| `match_id` | `fixture_id` |
| `match_number` | `fixture_number` — **U7; `undefined` breaks the sort at `PointsBreakdownModal.tsx:255` and `analyticsHelpers.ts:30`** |
| `stage` | literal `'regular_season'` — **U7; `undefined` is what drives U1 and U2** |
| `multiplier` | `1` |
| `pso_points` | `0` |
| `teams_match` | `true` |
| `predicted_home_team_id`, `predicted_away_team_id`, `predicted_home_pso`, `predicted_away_pso`, `actual_home_pso`, `actual_away_pso` | `null` |

Plus two league-only fields the ordering needs: `kicked_off_at`, `matchweek_number`. Ordering is `(kicked_off_at DESC, fixture_number DESC)` in the four narrow readers (`:320`, `:360`, `:398`, `:423`).

L6's assertion is not "emits all 22 keys" — it is a typed test naming `stage`, `base_points` and `match_number` specifically, because those three are the ones a prose omission-list loses.

### 6.3 The reveal gate (S1) — the launch blocker

`lib/predictions/revealGate.ts:54` branches only on `pool.prediction_mode === 'progressive'`; everything else falls to the single pool-wide `prediction_deadline` at `:66-68`. Both callers reach it through a cast that defeats the compiler: `app/api/pools/[pool_id]/bulk/route.ts:99` does `(pool.prediction_mode ?? 'full_tournament') as PredictionMode`, and `entries/[entry_id]/predictions/route.ts:106` does `pool.prediction_mode as PredictionMode`. `PredictionMode` at `revealGate.ts:20` is a 3-value union, so widening it elsewhere errors at neither site.

**The direction is now determinate.** The live league pool's `prediction_deadline` is `2026-08-21 18:00:00+00` — an hour before the season's first kickoff. From that instant `computeReveal` returns `{revealed:true, scope:'all'}` and `gatePoolPredictions` (`:114`) hands every member every other member's picks **for every unplayed matchweek through MW38**. It enables copying, it is the exact rule the file's own header says must never break, and it renders as a normal Results/Members tab so nobody reports it.

**Fix:**
1. `revealGate.ts:54` → `if (usesRounds(pool.prediction_mode))`.
2. Widen `PredictionMode` to four values, exported from one place (§7.5).
3. `filterRevealedPredictions`'s third argument becomes a **match → round-key** map, not match → stage. For a league the key is `mw_{n}` from `league_fixtures.matchweek_id`, not the synthesised `stage`.
4. Replace both `as PredictionMode` casts with `parsePredictionMode(x)` that throws on an unknown value.
5. `scripts/verify-bulk-reveal-gate.ts` gets a league case — today it returns CLEAN on a pool it never examines.

### 6.4 The prediction adapter, and the honest reader inventory (S8, N6)

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

`PredictionRow` is the existing 8-field `PREDICTION_COLUMNS` shape (`lib/poolData.ts:45-46`); the league adapter emits `match_id: fixture_id` and NULLs for the three PSO/winner fields. Everything downstream is unchanged.

**The inventory, re-derived mechanically:** `grep -rn "from('predictions')" app lib mobile components scripts` → **46 sites across ~30 files.** v1 listed 15. Every one lands in exactly one bucket, and the ESLint rule confining `.from('predictions')` to `lib/predictions/` ships in **L1**, so the list cannot silently grow again.

| Bucket | Sites |
|---|---|
| **Repointed via adapter** | `lib/poolData.ts:485` (the single most expensive statement in the product; its empty result fans out to Banter member levels, the share-card picker, Results, Analytics, Members and the entries list, and `getPoolBulkDataCached` serves the emptiness for 45s) · `lib/analytics/entryAnalytics.ts:112-132` · `lib/push/badges.ts:384` · `predictions/route.ts:57,277` · `predictions/round/route.ts:117` · `entries/[entry_id]/predictions/route.ts:175` (**the shipped "see everyone's picks" route**) · `entries/[entry_id]/breakdown/route.ts:264` · `entries/[entry_id]/analytics/route.ts:105` · `app/pools/page.tsx:112` · `app/dashboard/page.tsx:317` · `app/pools/[pool_id]/page.tsx:76` · `PoolDetail.tsx:436,555` · `app/profile/page.tsx:121,272` · `app/api/matches/[match_id]/stats/route.ts:71` · `lib/email/segments.ts:313` · `app/api/admin/stats/route.ts:35` |
| **Repointed, mobile — OTA-gated (§10)** | `mobile/lib/usePredictions.ts:103,291` · `mobile/lib/useHomeData.ts:449` · `mobile/lib/useMatchDetail.ts:223` · `mobile/app/pool/[id]/banter.tsx:885` · `mobile/components/pool-detail/BanterSheet.tsx:2294` |
| **Excluded with `.is('league_season_id', null)` + logged skip count** | `lib/auto-submit.ts:103` · `lib/auto-submit.ts:288` (the sweep the audit ranks most dangerous — with no submission gate it is no longer load-bearing for points, but it must still not iterate league pools) · `app/api/admin/send-template/route.ts:370,447,900` · `app/api/admin/send-pending-reminders/route.ts:109,202` |
| **Refused loudly** | `predictions/route.ts:358` (409) · `bonus/calculate/route.ts:143` (400) |
| **Scripts — league arm or explicit `SKIPPED (league)` line** | `scripts/audit-bonuses.ts:111` · `scripts/verify-bulk-reveal-gate.ts:167` · `scripts/verify-read-paths.ts` · 3 others. **Both of the first two currently return CLEAN on a league pool they never examined.** `audit-bonuses` is the recipe memory says to re-run at every competition end; `verify-bulk-reveal-gate` is the privacy check for the visibility feature |

### 6.5 Separate SQL functions, not shared branches (W7)

- `pool_match_prediction_accuracy(uuid, boolean)` — **body unchanged.** New `league_match_prediction_accuracy(uuid)`; TS dispatch at the one caller, `lib/poolData.ts:327`.
- `entry_match_score_summary(uuid[], text)` (migration 037) — **body unchanged.** New `league_entry_match_summary(uuid[])`, ordering by `(kicked_off_at DESC, fixture_number DESC)`; TS dispatch at the RN home-screen caller.

A UNION ALL arm is planned even when it returns nothing, so a shared branch puts a second scan node in the World Cup's hottest per-page RPC — and any future edit to the league arm becomes an edit to a function 623 live pools call. That is precisely the coupling the fork exists to sever.

### 6.6 Everything else the fork makes unreachable

With league fixtures in `league_fixtures`, the World Cup engine cannot see one at all:

- `shadow_reconcile_matches` (cron 19) selects work from `matches LEFT JOIN shadow_match_state`. A league fixture is in neither.
- Consequently the three `FROM predictions` reads inside `shadow_score_match` become **unreachable**, not merely empty.
- The cross-engine data-eater — the `DELETE … NOT EXISTS` arm that would purge a league engine's rows from `shadow_match_scores` — is structurally impossible.
- `trg_shadow_bump_inputs_matches` is `ON public.matches`; a league fixture update never fires it.
- `advance-teams`, `advancementTriggerFor`, `resolvePredictedBracket`, `shadow_entry_bracket` — none reachable by a fixture with no `stage`.

**The fork converts about a dozen silent-empty readers into unreachable code paths.** State that in the migration header; it is the single strongest argument for the purpose-built tables.

Also skipped for a league rather than run-and-discarded: `lib/poolData.ts:265` `match_conduct` (the Premier League's tiebreakers are goal difference then goals scored — conduct is genuinely unused); `lib/poolData.ts:347` `tournament_awards` (no podium); `poolData.ts:208` knockout-stripping (which survives today only by `[].every() === true`); `ResultsTab.tsx:156-180` `resolvePredictedBracket` over 380 fixtures.

---

## 7. Containment of World Cup machinery

### 7.1 The four global selectors

These select pools or entries **globally**, not from `matches`, so they reach league pools regardless of the fork. Each fix is one additive conjunct, provably false for every World Cup pool.

| Function | What it does to a league pool | Change |
|---|---|---|
| `shadow_reconcile_adjustments(integer)` — cron 20, every 2 min | Selects a league entry with any `point_adjustment` (`se.entry_id IS NULL AND COALESCE(pe.point_adjustment,0) <> 0`), calls `shadow_finalize_totals`, which inserts a **zeroed** `shadow_entry_totals` row — firing `broadcast_pool_leaderboard_ins` and pushing zeros onto `pool:{league_pool}:leaderboard`. A live wrong-data push, armed today | `AND po.league_season_id IS NULL` |
| `shadow_finalize_totals(uuid[])` | `tmp_ft` is unfiltered when `p_pool_ids IS NULL`. Belt-and-braces even after the caller above is fixed — it protects every future NULL call, including scripts | `AND po.league_season_id IS NULL` in `tmp_ft` |
| `shadow_eligible_entries(uuid[])` **(W6)** | Its first arm is `pe.has_submitted_predictions`, which `predictions/round/route.ts:161` sets on league entries. So every league entry flows into `shadow_entries_needing_rederive` → `shadow_mark_pools_rederived` → a row in `shadow_entry_bracket_state`: league data in frozen World Cup scoring state | `AND po.league_season_id IS NULL` |
| `shadow_detect_diffs()` — cron 21 **(W5, N5)** | **v1's justification was wrong.** Verified from `pg_get_functiondef`: the mismatch INSERT is `FROM shadow_entry_totals s JOIN pool_entries pe` — INNER, originating at shadow — so row *absence* cannot produce a diff. The reachable path is the `point_adjustment` one above, which becomes a genuine mismatch once the D6 mirror is live. Separately the `coverage` rollup is `FROM pool_entries … LEFT JOIN shadow_entry_totals … GROUP BY po.prediction_mode`, so `league_pickem` appears as its own permanently-red `{live:N, shadow:0}` key | `AND po.league_season_id IS NULL` on **both** the mismatch insert and the coverage subquery |

Verification is mechanical: a `pg_get_functiondef` diff before/after must show **exactly one added conjunct per function**.

### 7.2 Left deliberately inert, with justification

| Reader | Why inert is correct |
|---|---|
| `shadow_score_match` × 3 `predictions` reads | Unreachable — §6.6 |
| `lib/scoring/shadowBrackets.ts:195`, `:501`, `:636` | All resolve or materialise **bracket** inputs. `:501`'s purge-then-rewrite has nothing to purge |
| `shadow_calculate_bonuses`, `shadow_calculate_bp_bonuses` | Only called with pool ids derived from `shadow_match_scores` or `prediction_mode='bracket_picker'`. A league pool appears in neither |
| `app/api/cron/shadow-materialize:82,91` | The league needs no equivalent — §4.2 |
| `lib/migrations/032_*.sql:152` quarantine net | With `shadow_eligible_entries` contained (§7.1) a league entry never reaches it. Without that predicate it is disarmed by construction: `EXISTS (SELECT 1 FROM predictions …)` is false, so the entry is marked "successfully rederived" having derived nothing. This is why W6 is not cosmetic |

### 7.3 The `predictions` write guard (D4, W8)

```sql
-- Name sorts FIRST: BEFORE ROW triggers fire in name order, and the live
-- trg_enforce_prediction_before_kickoff returns NULL for every completed
-- World Cup match, so a later-sorting trigger would never be reached.
CREATE FUNCTION reject_league_pool_prediction() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pool_entries pe
               JOIN pool_members pm ON pm.member_id = pe.member_id
               JOIN pools po        ON po.pool_id   = pm.pool_id
              WHERE pe.entry_id = NEW.entry_id AND po.league_season_id IS NOT NULL) THEN
    -- Per-row SKIP + WARNING, not RAISE EXCEPTION. auto-submit and the mobile
    -- PostgREST client both batch upserts; a statement abort would discard
    -- correct World Cup rows alongside the offending league row.
    RAISE WARNING 'predictions: entry % is a league entry — row skipped, use league_predictions', NEW.entry_id;
    RETURN NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_aa_predictions_reject_league_pool
  BEFORE INSERT OR UPDATE ON predictions FOR EACH ROW
  EXECUTE FUNCTION reject_league_pool_prediction();
```

Provably a no-op for all 623 existing pools: the predicate is false for every one.

### 7.4 What is KEPT permanently (W2)

- **`mode_submits_per_round(text)` and `stage_has_scheduled_teams(text)` are never dropped.** `SELECT count(*) FROM pg_depend WHERE refobjid = 'mode_submits_per_round(text)'::regprocedure` returns **0** — Postgres records no dependency for plpgsql body references. A `DROP FUNCTION` succeeds silently, and from the next minute cron jobid 19 (`* * * * *`) raises `function does not exist` and aborts the whole reconcile transaction. `lib/migrations/046_league_scoring.sql:476`'s "can be dropped afterwards" comment is the trap. Keeping two inert one-line SQL functions costs nothing.
- `matches.round_number`, `matches.round_label`, `idx_matches_tournament_round` — **kept** (U4). Nullable, zero non-null rows after the data delete, and `lib/poolData.ts:54` names `round_number` in a select whose error is discarded at `:198`. Dropping it blanks fixtures for all 623 World Cup pools with no error anywhere.
- `tournaments.external_provider / external_league_id / external_season / format` — **kept.** `lib/integrations/apiFootball/syncTargets.ts:69` selects all four for every competition, and the World Cup row itself carries `external_league_id=1 / external_season=2026`. 024's own down-migration drops them; do not run it.
- `pools_prediction_mode_check` including `'league_pickem'` — kept (D1).
- `lib/competitionFormat.ts` — kept entirely. `advancementTriggerFor` is imported by `app/api/cron/sync-fixtures/route.ts:19,293`, the World Cup's own live cron.
- `backup_shadow_match_scores_pre_r20` / `backup_shadow_entry_totals_pre_r20` — **kept and NOT restored.** They hold the pre-046d two-base numbers; restoring undoes both 046d and the R20 re-score.

### 7.5 The three safeguard layers, corrected (S12)

**Layer 1 — the compiler.** `CompetitionRef` removes `tournament_id` from `PoolData`. But v1 overstated this: `PredictionMode` is re-declared as a 3-value literal union in ~20 files (`types.ts:24`, `LeaderboardTab.tsx:31`, `ResultsView.tsx:71`, `MatchCard.tsx:151/:419`, `AnalyticsTab.tsx:42`, `PointsBreakdownModal.tsx:34`, `ScoringRulesTab.tsx:205`, `HowToPlayTab.tsx:10`, `community/types.ts:173`, `PoolsClient.tsx:33/:62`, `DashboardClient.tsx:38`, …) and narrowed by `as` at `PoolDetail.tsx:1419, 1438, 1818, 1875, 1893, 2030`. **A narrowing `as` from a widened union is legal TypeScript and produces no error**, so widening alone names none of them. So: one exported `PredictionMode` from `lib/poolModeInfo.ts`, an ESLint ban on inline literal unions of mode strings, and every `as '…' | '…' | '…'` replaced with the widened type. Plus the `.from('predictions')` / `.from('matches')` / `.from('pool_round_states')` confinement rules, in **L1**.

**Layer 2 — the database.** §7.3.

**Layer 3 — the outcome.** `league_scoring_health`, extended past scoring per S12:

```
completed_fixtures > 0 AND eligible_entries > 0
  ⇒ scored_rows > 0
  ⇒ totals_rows  = eligible_entries
  ⇒ xp_rows      = eligible_entries                       -- S2
  ⇒ pool_entries.scored_total_points = league_entry_totals.total_points
        for every entry, point_adjustment included         -- D6 mirror drift
  ⇒ exactly one matchweek is in state 'open' whenever
        now() < the season's last lock_at                  -- S3
  ⇒ no entry has league_predictions in a locked matchweek
        with zero league_match_scores rows for it          -- S4/§5.2
```

Run as a Vitest fixture against a synthetic pool in CI **and** as a cron alarm in production. Layer 3 checks *results, not code paths*, which is why it catches readers nobody thought of — but it is blind to the reveal-gate leak (§6.3) and to mobile (§10), and the design should not pretend otherwise.

---

## 8. Notifications and lifecycle sweeps (S11, N4)

Not in v1 at all. Four sweeps select globally from `matches` and join pools on `tournament_id`:

| Site | Failure | Disposition |
|---|---|---|
| `lib/push/time-based.ts:48-72` `fireMatchStartingPushes` | Selects matches in a T+60..T+90 window, then `.eq('tournament_id', match.tournament_id)` on pools. Zero league kickoff reminders | **Repoint** at `league_fixtures` |
| `lib/push/recaps.ts:45-63` `firePendingMatchdayRecaps` | Groups the last 48 h of `matches` by `tournament_id`. Zero league matchday recaps — a shipped feature | **Repoint.** Also `recaps.ts:192` reads `s.total_points`, which §1.6's rename now satisfies |
| `lib/auto-archive.ts:33-70` | Builds `tournamentIds` from `pools.map(p => p.tournament_id)`. A completed season stays `'open'` indefinitely. Guarded by `totalCount > 0`, so it fails safe | **Repoint** |
| `app/api/admin/send-pending-reminders/route.ts:159-166` | `ROUND_MATCH_STAGES[roundKey] ?? []` → undefined for `mw_7` → `.in('stage', [])` | **Repoint via `readRoundStates` + the fixture adapter** |

**N4 — the same `ROUND_MATCH_STAGES[key] ?? []` pattern appears at four sites, not one:** `rounds/[round_key]/state/route.ts:105`, `admin/advance-teams/route.ts:395` and `:434`, `admin/send-template/route.ts:403`, plus the reminders site above. `advance-teams` is bracket-only and correct; the other three need the fixture adapter or an explicit league refusal.

**A sweep that excludes rows must log how many it excluded.** That single line is what turns all of these from silent into visible — a sweep that processed nothing looks identical to a sweep with nothing to do.

---

## 9. UI reuse — the honest total

### 9.1 v1's count was wrong, and by how much

v1 §4.1 listed eight components as **"Untouched"** — `LeaderboardTab`, `MembersTab`, `PointsBreakdownModal`, `CommunityTab`/Banter, `AnalyticsTab`/Form, `PoolInfoTab`, plus `ProgressivePredictionsFlow` / `RoundStatusCard`. **Five of those eight need work**, two of them CRITICAL.

**Verified total: 21 shared web modules require an edit, 2 new components must be built, and 1 component cannot be reused at all.** The architecture claim — *"reuse the World Cup UI, repointed"* — survives: no finding forces a parallel UI, the reuse boundary (`MatchData` / `TeamData` / `EntryScoring`) is the right one, and the realtime leaderboard genuinely is table-agnostic. But the work is roughly 3× what v1 booked.

### 9.2 The 21

| File:line | What breaks | Fix |
|---|---|---|
| `PointsBreakdownModal.tsx:812-818` **(U1, CRIT)** | Seven literal `renderMatchStageSection('group'…'final')` against a Map keyed on `stage` (`:259-267`). CSV repeats them at `:427`. Correct non-zero total in the header, **entirely blank Match Points beneath** | Iterate `[...matchesByStage.keys()]` ordered by `sortRoundKeys`; same at `:427`; add `regular_season` to local `STAGE_LABELS` (`:63-71`); change `isKnockout` at `:1034` to an explicit test. *Bonus (`:288-317`) and Podium (`:346`) already return empty, which is correct* |
| `analytics/analyticsHelpers.ts:269` **(U2, CRIT)** | `STAGE_ORDER.filter(s => byStage.has(s))` drops every league bucket → `computeStageAccuracy` returns `[]`. **Blast radius is mobile, not the web Form tab** — the only consumer is `entries/[entry_id]/analytics/route.ts:197` → `by_stage` (`:320`) → `mobile/lib/api.ts:258`. Invisible to any web QA | Append unknown keys after the ordered pass; add a `regular_season` label at `:113` |
| `analytics/xpSystem.ts:336, :498` **(U3, HIGH)** | `stage === 'group'` as "not knockout" → ~380 phantom +25 events/entry/season on the **shared** leaderboard | Positive knockout test |
| `analytics/xpSystem.ts:489` | `entryPredictions.length >= 104` — the World Cup match count as a literal. `formatStageLabel` (`:656-665`) returns the raw string, so Knockout King reads "Correct result in regular_season" | Pool's own fixture count; route the label through `roundLabel`. Also revisit `BADGE_DEFINITIONS` copy at `:96-110` — "Predict all 12 groups", "Predict all 104 matches", "Correctly predict the World Cup Final result" render verbatim in a league member's trophy grid |
| `components/predictions/KnockoutStageForm.tsx:289` **(U5, HIGH)** | PSO block gated only on `bothResolved && hasPrediction && isDraw`. `ProgressivePredictionsFlow.tsx:535` routes every non-`'group'` round here, so a member predicting 1-1 in a PL fixture is offered a penalty shootout — and the form's own count (`:55-57`) contradicts the parent's save bar (`:169`) on the same screen | `psoApplies` prop (false when `isMatchweekKey(stage)`), gating `:289` and the draw branch at `:40-46` |
| `admin/MembersTab.tsx:983` | `ViewPredictionsModal` declares its own seven-stage `stageOrder` + names map (`:984-991`), loops it at `:1133`/`:1147`, CSVs it at `:1008`/`:1027`, and runs `resolvePredictedBracket` at `:969`. Only `bracket_picker` is diverted at `:696-699`, so a league pool takes this arm. **A pool admin sees an entry name, a points total, and no predictions at all.** Not in v1 anywhere | Derive sections from `predsByStage` keys ordered by `sortRoundKeys` |
| `results/MatchCard.tsx:54` | `STAGE_LABELS[stage] \|\| stage`; `lib/tournament.ts:134-142` has no `regular_season`. 380 rows of "regular_season · Match #123" at `:235` and `:494` | `roundLabel(matchweekKey(round_number))` |
| `results/ResultsView.tsx:29` | `STAGE_TABS` module constant of seven, closed `StageTab` union at `:16-23`, `'finals'` special case at `:103-112`, A–L strip at `:238-247`, `hasGroupResults` at `:149-153` | Tab list becomes a prop; filter on `round_number`; hide the A–L strip. **The `GroupStandingsComparison` slot at `:255-266` is where `LeagueTable` mounts** |
| `ScoringRulesTab.tsx:268` | Default body is 100% World Cup: Group card, six knockout multipliers, PSO card, bonus copy citing "48 group matches" / "32 qualifying teams" (`:280-360`) | Third branch beside `:269` with a flat tier table; reuse `TieBreakerCard` (`:167-199`), already correct |
| `HowToPlayTab.tsx:32` | Hardcoded "This is your FIFA World Cup 2026 prediction pool", 48 teams / 12 groups (`:40-44`), "104 matches total" (`:56`). `isProgressive` at `:23` is a literal equality | Third branch; `:23` → `usesRounds()` |
| `lib/poolModeInfo.ts:14` | No `league_pickem` entry, and `PoolInfoTab.tsx:89` does `?? POOL_MODE_INFO.full_tournament`. **A league member's Pool Info tab currently reads "One deadline covers the whole tournament. All 104 matches…"** | Widen the union, add the entry. This is also the compiler hook that names the ~20 inline re-declarations |
| `PoolInfoTab.tsx:29` | Private seven-round `ROUND_LABELS` (`:29-37`) at `:136`; Deadlines section gated on `mode === 'progressive'` (`:85, :132`) — so **the whole per-round deadline list is hidden**, on the one tab whose job is telling members when their picks lock | `usesRounds()` at `:85`; `roundLabel()` at `:136` |
| `components/predictions/RoundStatusCard.tsx:94` | `ROUND_LABELS[k as RoundKey] ?? k` — the cast defeats the compiler; a league member sees a card headed "mw_7" | `roundLabel()` |
| `app/pools/[pool_id]/page.tsx:87` | Round states fetched only `if (mode === 'progressive')` → `roundStates=[]` → every matchweek renders locked and nobody can pick. And `:98-105` lazily seeds seven **hardcoded World Cup round keys** with `group` = open | `usesRounds()`; **DELETE the lazy seed** — `lib/poolRoundStates.ts:seedPoolRoundStates` is already format-aware, and under §3 a league pool seeds nothing at all |
| `PoolDetail.tsx:452` | Live round-state refetch gated `if (mode !== 'progressive') return` — while `:275` already computes `usesRoundFlow` correctly for the predictions tab. The inconsistency *is* the bug. Six narrowing casts at `:1419, 1438, 1818, 1875, 1893, 2030` | `usesRounds()`; widen the casts. **Do NOT re-enable the standings tab at `:109`** (U8) |
| `ResultsTab.tsx:156` | `knockoutTeamMap` runs `resolvePredictedBracket` over 380 fixtures on every render and the annotation silently disappears | `knockoutTeamMap = {}` for a league |
| `analytics/XPProgressSection.tsx:836` | Another private seven-round `STAGE_LABELS`; XP rows show "regular_season" | Matchweek fallback |
| `community/helpers.tsx:304` | Seven-case switch, `default: return stage`. Renders in the Banter share picker (`SharePredictionModal.tsx:190`) as "Match 123 · regular_season" | Matchweek arm |
| `app/dashboard/DashboardClient.tsx:181` | `formatStage` / `formatStageShort` (`:181-204`) — literal maps, both missing `third_place`, both keying `'finals'` not `'final'`. Renders at `:945, 1036, 1080, 1155, 1180` — the first surface after login | `roundLabel` / `roundShortLabel` |
| `app/profile/ProfilePage.tsx:125` | A third copy of `formatStage` with the same `'finals'` bug. The filter itself is data-derived and correct | `roundLabel` |
| `admin/MatchesTab.tsx:41` · `admin/ScoringTab.tsx:156` | `getStageName` literal map; and the admin scoring form offers six multipliers, a PSO price and the World Cup bonus set (`:156-271`) that the league engine will never read — a price an admin changes in good faith and nothing honours | Label via `roundLabel`; gate the multiplier/PSO/bonus cards off for league pools, leaving the three `group_*` fields |

Plus, from earlier sections and already counted as work: `lib/predictions/revealGate.ts` (§6.3), `lib/push/badges.ts` (§5.6), `lib/analytics/entryAnalytics.ts` (§5.6).

### 9.3 Genuinely new — two components

1. **`LeagueTable`** — the 20-row standings table (P, W, D, L, GF, GA, GD, Pts), derived from `league_fixtures` in SQL. Mounts in the `ResultsView.tsx:255-266` slot. The reusable piece is `BaseTeamTable` (105 lines), **not** `StandingsTab.tsx`.
2. **`MatchweekPicker`** — the 38-cell strip replacing the A–L group strip. Small.

### 9.4 Cannot be reused, stated plainly (U8)

**`app/pools/[pool_id]/StandingsTab.tsx` — 629 lines, group-partitioned throughout:** `stage === 'group'` filters at `:509` and `:521`, a `GROUP_LETTERS` loop building standings at `:549-551`, a `GROUP_LETTERS` selector strip at `:595`. v1 §4.2 proposed re-enabling it for league pools via the one-line config change at `PoolDetail.tsx:109`. That would mount a component which filters to `stage==='group'`, finds nothing, and renders twelve empty group cards behind an A–L selector — a visibly broken tab shipped by a config flip. **Drop the re-enable. `LeagueTable` mounts in the Results slot and nowhere else, unless and until it is built out to fill a tab.**

### 9.5 What genuinely is untouched

`PoolDetail.tsx:769-782` realtime subscription (given N2's trigger fix) · `liveMerge.ts` · `LeaderboardTab` · `CommunityTab`/Banter · `EveryoneElseSection` / `EntriesListView` / `SpectatorEntryView` (once the `pool_entries` mirror lands) · `ProgressivePredictionsFlow`'s round model · the leaderboard and `/live` response contracts · every share-card. The `{country_name, country_code, flag_url}` shape stays as a wart on the *type*, not the screen — renaming it touches every prediction flow and match card for zero user-visible benefit. Fix it when a third sport forces it.

---

## 10. Mobile (S9)

Not addressed in v1 at all, and Layer 2's central claim fails there.

**The exposure today.** `mobile/lib/useHomeData.ts:206-224` lists pools straight off `pool_members` with no competition filter; `mobile/lib/usePoolEntries.ts:61-67` reads entries the same way. A league pool appears in the mobile list. Tapping it opens the World Cup prediction flow, which fetches with `.eq('tournament_id', tournamentId)` (`mobile/lib/useMatchDetail.ts:240`) — NULL under option A, rendered as `tournament_id=eq.null`, zero rows, no error, "no matches."

**Layer 2 does not save it.** `mobile/lib/usePredictions.ts:291-299` upserts and, on error, does `console.warn` and re-queues into `pendingRef`. It never surfaces anything. So the guard trigger fires, the warning is swallowed, the app says "saved", and it retries forever. The picks do not exist.

**And the last OTA was 2026-07-30** (memory: `project_eas_ota_pending`), so nothing shipped since then is on devices — including the format filter in commit `150ab5e`. A tester can create a `full_tournament` pool on Premier League 2026/27 today from a field build.

**v2 sequence:**

1. **L0** — deleting the `tournaments` row is the only thing that closes the field-build exposure. Nothing else does.
2. **L3** — mobile hard-blocks: `useHomeData` and `usePoolEntries` filter `.is('league_season_id', null)`, and the pool detail route shows *"This pool needs the latest app version"* rather than an empty World Cup flow. **This ships as an OTA before the web L9.**
3. **L4** — surface `flushPending`'s upsert error in the UI instead of `console.warn`.
4. **L8/L9** — the real mobile repoint: `usePredictions` → `league_predictions`, `useMatchDetail` → `league_fixtures`, `useHomeData:366-369` and `PoolInfoTab.tsx:466` → the derived round states, `mobile/lib/api.ts:258` `by_stage`.

Memory's EAS rules apply: publish **per-platform** (`--platform all` crashes on Expo web export) and **from `mobile/`**. Verify the API side is deployed **before** an OTA that calls new routes — and note this is the inverse case for step 2, where the OTA must land *before* the door opens.

---

## 11. Phased build order

Dependency order. Every phase has a verification step and a stated rollback.

### L0 — Revert, and close the door

**Order matters; each step's count is asserted before the next runs.**

0. **Annotate both poison sources.** `drafts/2026-08-14_pre046_shadow_rollback.sql` — correct its header (line 16 says "run this whole file") and mark lines **71-76** ⚠ DO-NOT-RESTORE. **And `lib/migrations/046_league_scoring.sql:176-180`**, which the reviewers missed: it still holds the two-base `stage_uses_base_prices` CASE and is `CREATE OR REPLACE`-idempotent, so re-running it silently undoes 046d, re-introduces the double-counted knockout price across ~597 pools, and re-creates a function 046d dropped.
1. **Code first, DB second.** `app/competitions.ts:39-40` → `state:'upcoming'` / "Coming soon". `components/pools/CreatePoolModal.tsx` — remove the `isLeagueTournament` branch (`:152-153`), the mode card (`:455`), the deadline label (`:557`). **This is the door; it must close before the DB steps or a member can create a second league pool mid-flight.** Same commit: `.eq('tournament_id', pool.tournament_id)` on `lib/poolData.ts:201` (W11) and `lib/scoring/recalculate.ts:129`.
2. Disarm cron jobid 8 `api-football-sync`. It resolves the PL row as a live target via `syncTargets.ts:68-70` (selection is `external_league_id IS NOT NULL`, not status) and burns API calls every minute until the row is gone. Re-arm after step 8.
3. Delete the **38 `pool_round_states`** rows of pool `c16a9a56-…`, then the pool itself with its 3 members / 3 entries / 1 `pool_settings`. **Explicitly and first** — `pools_tournament_id_fkey` is `ON DELETE CASCADE`, so deleting the tournament later would take it silently.
4. Delete the **380 `shadow_match_state`** rows keyed to league matches. Cascades anyway, but delete explicitly so the count is an assertion.
5. Delete the **380 `matches`** rows (`stage='regular_season'`), then the **20 `teams`** rows (after the matches — `matches_home_team_id_fkey` has no cascade), then the `tournaments` row `b1299174-…` **last**. Assert `teams` returns to **48**.
6. **Revert four shadow functions by targeted textual substitution.** In `shadow_score_match`: `NOT stage_has_scheduled_teams(stage)` → `stage <> 'group'` **first** (2 hits), then bare `stage_has_scheduled_teams(stage)` → `stage = 'group'` (3 hits) — five sites in two forms, not the three v1 claimed — and `mode_submits_per_round(po.prediction_mode)` → `po.prediction_mode = 'progressive'` (3 hits). **Leave def-lines 48-54 exactly as live: that is 046d single-base pricing and it must not move.** `shadow_eligible_entries` and `shadow_finalize_totals` from the rollback file's clean hunks (`:249-266`, `:270-end`). **`shadow_calculate_bonuses` (W2) has no rollback artifact anywhere in the repo** — 046e was applied by rewriting the function from its own `pg_get_functiondef` output; the inverse is the same one-token substitution at def-line 24.
7. Revert `enforce_prediction_before_kickoff` from `lib/migrations/045_*.sql:178-193` — **before** anything touches `matches.round_number`, because PL/pgSQL resolves column refs at runtime.
8. Revert `matches_stage_check` and `tournaments_tournament_type_check` (both unblocked now the data is gone). **Do not** drop `matches.round_number`, `round_label`, `idx_matches_tournament_round`, the four `tournaments` ingest columns, or the two predicate functions — §7.4.

**Verify — all reads, no writes (W4).** A read-only CTE recomputes expected `score_type / base_points / multiplier / total_points` over `shadow_match_scores ⋈ matches ⋈ pool_settings` and diffs against the stored columns. **Do not re-score.** `shadow_score_match` DELETEs, UPSERTs, and fires `broadcast_pool_leaderboard_ins/upd` — the verification step would be the destructive act it exists to guard against, and after a mis-executed step 6 it would rewrite ~597 pools' knockout scores and push them to live clients before the assertion said anything. If a live re-score is genuinely wanted, wrap it `BEGIN … ROLLBACK`.

Plus: `pg_get_functiondef` on all five functions matches pre-046 except the deliberate 046d keep · `count(*) from matches where stage='regular_season'` = 0 · `teams` = 48 · `pools` = 623 · **open two World Cup pools in a browser and confirm fixtures, results and a points breakdown render** (U4 — the one check that catches a discarded PostgREST error, and the one no automated step in v1 had).

**Rollback:** fully reversible — the importer is idempotent by `external_match_id` and re-pulls the season in one command.

**⚠ Consequence to name (audit blocker 4):** commit `050043d` filters competitions by end date, and the World Cup ended 2026-07-19. Once the PL row is deleted the web wizard offers **zero** competitions. That is "nobody can create a pool on SportPool" and should be a deliberate call (D8).

### L1 — DDL, importer, and the lint rules

Eight tables, RLS (including the four transcribed `league_predictions` policies), the four league triggers. Retarget `importLeagueSeason.ts`. **Ship the three ESLint confinement rules and the single exported `PredictionMode` here, not at L8** (S8, S12) — so the reader inventory cannot grow silently during the build.

*Verify:* 1 season, 20 clubs, 38 matchweeks, 380 fixtures; `count(*) group by matchweek_id` = 10 for all 38; every `lock_at` = its matchweek's `min(kickoff_at)`; the empty-has-no-lock CHECK holds; `matches` / `teams` counts unchanged from L0; `npm run lint` green with the new rules.
*Rollback:* `DROP TABLE` — nothing references these yet.

### L2 — Sync arm

League branch in `app/api/cron/sync-fixtures` writing `league_fixtures`, plus the matchweek-window trigger.
*Verify:* a replayed payload moves a kickoff and `lock_at` follows **while still future** and does **not** move once past; deleting the last fixture of a matchweek zeroes `fixture_count` (the LEFT JOIN correction); a completed fixture writes goals, `is_completed` and `completed_fixture_count`; the World Cup's sync run notes unchanged.
*Rollback:* remove the branch.

### L3 — The `pools` touch, `CompetitionRef`, and the mobile block

`league_season_id`, `league_start_matchweek`, `DROP NOT NULL`, the CHECK, the discriminated union on `PoolData`, and the throwing `competitionRef()`. Fix every compile error. **Ship the mobile hard-block OTA (§10 step 2) in this phase.**

*Verify (W9 — a response diff, not a build):* capture `/api/pools/:id/leaderboard`, `/live`, `/match-scores` and `/bulk` for **five** World Cup pools — one per `prediction_mode`, one archived, one with a non-zero `point_adjustment` — before the sweep, and assert byte-identical responses after. Plus `count(*) from pools where league_season_id is not null` = 0, and `npm run build` clean.
*Rollback:* DDL yes; the type sweep is a revert commit. **This is the last fully-cheap-to-revert phase.**

### L4 — Prediction write path

`league_predictions` routes, `lib/predictions/store.ts`, the lock trigger, the pool-guard trigger, `trg_aa_predictions_reject_league_pool`, and the reveal-gate fix (§6.3) with `parsePredictionMode`. Surface mobile's `flushPending` error.

*Verify:* a league pick saves and reads back through RLS as the **anon** client, not just service-role · a pick written after `lock_at` is silently skipped (0 rows changed) · a `predictions` insert for a league entry is skipped with a WARNING and **the surrounding batch's World Cup rows still land** · a `league_predictions` insert for a World Cup entry RAISES · the `predictions` trigger is a no-op on a real World Cup write · `scripts/verify-bulk-reveal-gate.ts` with a league case returns *not-revealed* for an unlocked matchweek and *revealed* for a locked one · `predictions_submitted_at` is set on the entry's **first saved prediction** (N7).
*Rollback:* yes, but from here a league pool may hold member data — reverting means exporting picks first.

### L5 — Scoring

`league_score_fixture`, `league_finalize_totals`, `league_rescore_pool`, `league_reconcile_fixtures`, `league_snapshot_ranks`, `league_round_states`, `lib/rounds/read.ts`, the **corrected `broadcast_pool_leaderboard()` (N2)** and its two triggers, the two crons, the `/recalculate` league arm, the adjustment trigger, the `badges.ts` surgery (§5.6), and the **four containment predicates** (§7.1).

*Verify:* a synthetic matchweek (10 fixtures, ≥3 entries, hand-computed expected points) end to end —
- every one of the fifteen required scoring outputs populated and correct;
- `final_rank` matches a hand-applied tiebreak cascade;
- the diff-aware upsert produces **zero** broadcasts on an unchanged re-run;
- **the broadcast payload is captured off the wire and asserted to carry all seven `LiveEntry` keys, `point_adjustment` and `scored_total_points` included** (N2 — the check whose absence is the whole finding);
- `entry_xp_state` row count = eligible entries (S2, moved up from L7);
- an entry that made picks and **never pressed Submit scores normally** (S4/§5.2);
- an admin `point_adjustment` moves the leaderboard within one cron tick (S5);
- a postponed MW7 fixture leaves MW7 `in_progress` and **MW8 still opens** (§3.3b);
- `league_scoring_health` green on all seven assertions.

Separately: `pg_get_functiondef` diff on the four contained functions shows **exactly one added conjunct each**, and L0's read-only World Cup check still passes.
*Rollback:* drop the crons (scoring stops, data intact); the predicates revert by re-running the pre-046 bodies. The broadcast function reverts to the captured live body.

### L6 — Read path

`getScoringSource(ref)` third value and the eight `getShadowReadPools` callers collapsed onto it (S6/N3), `readMatchScores` + four narrow readers, `poolData.ts` league branches, `league_entry_match_summary`, `league_match_prediction_accuracy`.

*Verify:* a league arm in `scripts/verify-read-paths.ts` that **asserts non-empty** · the World Cup arm of both new-sibling functions is untouched (`pg_get_functiondef` byte-identical) · a typed test asserting the league arm emits `stage`, `base_points` and `match_number` specifically (U7) · a CI assertion that `getShadowReadPools` has exactly one caller.
*Rollback:* code only.

### L7 — Analytics, XP, badges, the mirror

Adapter wiring into `entryAnalytics.ts`; the `pool_entries` mirror; the `xpSystem` knockout inversion (U3) and the badge-copy fixes.

*Verify:* every eligible entry has an `entry_xp_state` row with `total_completed = 10`, non-zero `hit_rate`, populated `last_five`, `current_level > 1` where earned · **zero Knockout King events** on a league entry (U3) · `lightning_rod` not awarded after one matchweek (S7) · `pool_entries.scored_total_points = league_entry_totals.total_points` for every entry · `shadow_detect_diffs()` clean.

### L8 — UI

The 21 modules of §9.2, `LeagueTable`, `MatchweekPicker`, the `page.tsx:98` lazy-seed deletion, the `usesRounds` repoints, and the real mobile repoint (§10 step 4) as an OTA.

*Verify:* **in a browser, on a real league pool with a scored matchweek** — leaderboard, Banter, Form, Results, Predictions, Pool Info, points breakdown, admin View Predictions, admin Scoring. Then the same on the Expo build. Memory's standing lesson: a green build is not verification.

### L9 — Open the door

`league_scoring_health` cron alarm live; wizard league option; `app/competitions.ts` → `'open'`.
*Verify:* create a real pool, invite two people, submit a matchweek, and **watch a live fixture move the leaderboard without a page refresh** — the one test that exercises N2 with real data.
*Rollback:* flip `app/competitions.ts` and the wizard — one deploy.

---

## 12. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Does `pools_prediction_mode_check` keep `'league_pickem'` through the revert? | **Keep.** A value in a shared column, not World Cup structure. `lib/competitionRounds.ts:222`, `lib/poolRoundStates.ts:67`, `app/api/pools/create/route.ts:139` and `app/api/admin/branded-pools/route.ts:217` all still name it |
| **D2** | **Edit `broadcast_pool_leaderboard()`** — a shared function the World Cup uses — to emit `scored_total_points` and `point_adjustment` (N2) | **Take it, and treat it as a launch blocker rather than a league feature.** It is a live latent defect: the current payload writes `undefined` into two `LiveEntry` fields on every broadcast. It has never been seen only because the World Cup finished before this shipped. The Premier League's first goal is the first real execution. The `point_adjustment` derivation (`total_points - match_points - bonus_points`) means **zero DDL on any World Cup table** |
| **D3** | Two touches on shared-table triggers: `trg_aa_predictions_reject_league_pool` on `predictions`, and `trg_league_adjustment_rescore` on `pool_entries` | **Take both.** Each is provably inert for all 623 World Cup pools — the first's predicate is false for every one, the second's first statement is the league test. The first converts *every* missed writer, including ones nobody enumerated, from silent-zero into a logged skip; the second is the only durable answer to S5's "admin awards +50 and nothing moves" |
| **D4** | Four containment predicates on `shadow_reconcile_adjustments`, `shadow_finalize_totals`, `shadow_eligible_entries`, `shadow_detect_diffs` (both sites) | **Take all four.** The alternative is a live wrong-data zero-push onto a league leaderboard, league rows written into `shadow_entry_bracket_state`, and a permanently red parity report. One conjunct each, provably false for every World Cup pool |
| **D5** | `pool_settings.group_*` as the flat league tier, vs new `league_*` price columns | **Reuse `group_*`.** New columns mean a new admin surface, a new default, and a new way for two pools to be incomparable — a stated Showdown prerequisite. The `group_*` naming on a competition with no groups is a smell; renaming to `base_*` is a sport-#3 job |
| **D6** | Mirror totals into `pool_entries`, vs routing ten direct readers (six in mobile) through `readSource` | **Mirror.** `pool_entries` is explicitly shared; `recalculatePool` refuses league pools so there is no second writer; and six of the ten readers are in Expo and would need an OTA. **Note the correction to v1's stated justification:** it does *not* make `top_dog` work with zero code — `badges.ts:430` also gates on `scores.length > 0`, which requires the §5.6 score-table fix regardless |
| **D7** | **Round state: derived, zero `pool_round_states` rows** (§3) | **Take derived.** The stored cascade is measurably 15% broken over 7 rounds today (121 stuck rows, verified live), structurally deadlocks on a postponed fixture, and has a silent 1,000-pool ceiling that fires when every pool crosses the same Saturday 12:30 deadline. The one real cost — ten readers that would return `[]` — is closed by one adapter and one OTA |
| **D8** | The wizard offers **zero** competitions between L0 and L9 | **Accept it, deliberately and briefly.** It is the honest state: the World Cup is over and the Premier League is not ready. The alternative is leaving a door open onto a backend being rebuilt underneath it. Compress L0→L9 rather than soften L0 — but Ryan should decide, because it reads as "SportPool is closed" to anyone who visits |
| **D9** | No `league_bonus_scores` in v1 | **Confirm.** Create it with Final Table, with the four-part uniqueness `readSource.ts:274` needs |
| **D10** | Lock trigger: silent-skip vs `RAISE` | **Silent-skip**, for consistency with `enforce_prediction_before_kickoff` and because mobile writes directly. Flagging the trade-off honestly: a silent-skip *is* a silent-empty, and it is only acceptable because §3.4 guarantees the UI shows `locked` the instant `lock_at` passes |

### Where I am least certain

**The `predictions_submitted_at` tiebreaker under a submission-free scoring gate (N7).** Removing the gate is right — it dissolves S4 at the root — but it silently changes who wins a tie. Setting the timestamp on first *save* is the fix I propose, and it is untested against a real pool. If Ryan would rather the tiebreaker stay an affirmation, the alternative is `COALESCE(predictions_submitted_at, first league_predictions.created_at)` in the rank cascade, which is more faithful but adds a join to the hottest ranking statement.

### The two things I would not compromise on

1. **`league_fixtures.matchweek_id` as an FK, and `(kicked_off_at, fixture_number)` as the chronology** — the two places the World Cup's shape is quietly wrong for a league, and far cheaper to get right now than to retrofit once a season's picks are stored against them.
2. **The guard rule of §0.2** — a competition guard reads only columns its own select names, and the parse throws rather than defaults. v1 shipped that bug twice; the reviewers caught it once. A throw is the only treatment that is right in both directions, and the reviewer's proposed `!=` is not a general fix.

---

# R. Second review — all findings, unedited

## R.wc-safety — **sound-with-fixes**

**Were v1's findings actually fixed?** Nine of eleven genuinely fixed; one fixed in form but weakened in substance; one correctly diagnosed but wrongly prescribed. GENUINELY FIXED: W1 — the select at `recalculate.ts:76` is widened to `pool_id, prediction_mode, tournament_id, league_season_id` and the mode arm is kept, and v2 is right to reject my "loose !=" as a general rule; the generalisation is correct, though its enforcement mechanism is not (new finding 3). W2 — `shadow_calculate_bonuses` is named explicitly in L0 step 6 and §7.4 keeps the predicates permanently; verified live it carries exactly 1 `mode_submits_per_round` occurrence and `pg_depend` returns 0, so the premise holds (gap: `stage_uses_base_prices` omitted, finding 8). W3 — fixed and correctly extended; I confirmed both poison sources, the two-base CASE in `drafts/2026-08-14_pre046_shadow_rollback.sql` (~:71-77) and the `stage_uses_base_prices` CASE at `lib/migrations/046_league_scoring.sql:175-180`, and that 046 is `CREATE OR REPLACE`-idempotent. The second source is a real catch I missed. W6 — fixed; verified `shadow_eligible_entries` already joins `pools po`, so one conjunct works as claimed. W7 — fixed; separate `league_match_prediction_accuracy` / `league_entry_match_summary` with TS dispatch, World Cup bodies byte-identical. W8 — fixed and improved; renamed `trg_aa_*` to sort first, and correctly converted from `RAISE EXCEPTION` to per-row skip plus `RAISE WARNING` for the batched-upsert case I flagged. W9 — fixed; L3's gate is a captured response diff across 4 endpoints × 5 pools instead of `npm run build`. W10 — fixed; the per-table key with fallback to the existing global key preserves current behaviour exactly, which I verified against the live body. W11 — fixed and correctly promoted to a live-bug L0 step; verified 68 rows in `teams` and no tournament filter on `getPoolDataUncached`'s teams select (line refs off, finding 10). PARTIAL: W4 — the verification is no longer a write, which was the finding, but the read-only replacement cannot detect a botched substitution in the hunks being edited (finding 7). WRONG PRESCRIPTION: W5 — v2 accepts the correction and gets the mechanism right (INNER join from shadow, absence cannot diff; coverage adds its own key), but then prescribes the predicate on the mismatch INSERT, which has no `pools` alias in scope and does not need one (finding 4). Also worth recording: v2's N2 is a real find I did not make — I flagged the `point_adjustment` question as LOW/unverified in U9 and it is in fact a live latent World Cup defect confirmed against `pg_get_functiondef` and `liveMerge.ts:79-97`.

v2 is sound on the World-Cup-safety lens as an architecture — the fork leaves World Cup data untouched, the revert order is correct against the FK cascades I verified, and nine of my eleven v1 findings are genuinely fixed rather than reworded. Three things must change before build: the printed `broadcast_pool_leaderboard()` body references `n.point_adjustment`, a column `shadow_entry_totals` does not have, which would abort cron 19/20 every minute and stop World Cup scoring — the same W1/N1 defect class a third time, in the one shared-function edit v2 takes; `lite_recalc_entry`, an unlisted SECURITY DEFINER third writer of `pool_entries.scored_total_points`/`current_rank` called from the browser on every admin adjustment, falsifies D6's core justification; and the guard rule's compile-time enforcement does not exist because `createAdminClient()` is untyped, leaving only a runtime throw whose first casualty is the live analytics-sweep cron across all 623 pools.

### [CRITICAL] §1.7's printed `broadcast_pool_leaderboard()` body emits `'point_adjustment', n.point_adjustment`. Verified live via `information_schema.columns`: `shadow_entry_totals` has exactly {entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at, bonus_points, total_points, final_rank, previous_final_rank} — there is no `point_adjustment`. That function is attached to `shadow_entry_totals` by `broadcast_pool_leaderboard_ins`/`_upd`. The prose two paragraphs down says "v2 takes the derivation", but the code block is the artifact an implementer applies. This is the same defect class as W1/N1 — a reference to a column the source relation does not carry — shipped a third time, and this time inside the only edit v2 makes to a live World Cup function.

**Failure.** The FOR-loop SELECT cannot plan, so the trigger raises on every statement that writes `shadow_entry_totals`. That aborts `shadow_score_match` and `shadow_finalize_totals`, which aborts cron jobid 19 (`shadow_reconcile_matches`, `* * * * *`) and jobid 20 (`shadow_reconcile_adjustments`, `*/2 * * * *`) on every tick. World Cup re-scores, admin point adjustments and price changes all fail, for all 623 pools, from the minute the migration lands.

**Fix.** Print the derivation in the body, not the prose: `'point_adjustment', COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)`. This is verified correct for the World Cup arm — 164 of 164 entries with a non-zero `pool_entries.point_adjustment` satisfy `shadow_entry_totals.total_points = match_points + bonus_points + point_adjustment`, so the derivation reproduces the stored value exactly and `'scored_total_points', n.total_points` is also right. Add a pre-commit assertion that the new body executes once against each attached table before the migration is accepted.

### [CRITICAL] `lite_recalc_entry(p_entry_id, p_pool_id)` is an unlisted third writer of `pool_entries.scored_total_points` and `current_rank`, called from the browser at `app/pools/[pool_id]/admin/MembersTab.tsx:412` immediately after every admin point adjustment. It is SECURITY DEFINER. Verified body: it sets `scored_total_points = match_points + bonus_points + point_adjustment` for the entry, then re-ranks EVERY entry in the pool with `ROW_NUMBER()` whose second and third tiebreakers are `(SELECT count(*) FROM match_scores ms WHERE ms.entry_id = pe.entry_id AND ms.score_type = 'exact')` and `... <> 'miss'`, writing `current_rank` and `last_rank_update`. D6's central justification — "`recalculatePool` refuses league pools so there is no second writer" — is therefore false, and neither v1 nor v2 mentions this function anywhere.

**Failure.** On a league pool with the D6 mirror live, `match_scores` is empty, so both tiebreak counts are 0 for every entry and the pool silently re-ranks on `bonus_points` (always 0 in v1) then `created_at`. `pool_entries.current_rank` diverges from `league_entry_totals.final_rank` and stays diverged until an unrelated fixture completes. That column is what `badges.ts` `top_dog` gates on and what six mobile readers consume directly. It also stamps `last_rank_update`, the watermark the live analytics-sweep cron keys off. §7.5's health check compares totals only — `scored_total_points` is still right — so the check stays green while the ranks are wrong.

**Fix.** Add `lite_recalc_entry` to §7.1's containment set as a fifth site. First statement: `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN PERFORM league_rescore_pool(p_pool_id); RETURN; END IF;` — provably inert for all 623 World Cup pools, because the predicate is false for every one. Separately, add `pool_entries.current_rank = league_entry_totals.final_rank` to the L7 health assertion; totals-only is exactly the blind spot memory already records for the parity alarm.

### [HIGH] The guard rule of §0.2 — v2's own "one thing I would not compromise on" — has no compile-time enforcement on this codebase. `lib/supabase/server.ts:63-77`: `createAdminClient()` calls `createSupabaseClient(url, key, {...})` with no `Database` generic, so every `.select()` returns `data: any`. v2 also widened `competitionRef`'s parameter from v1's structural `{tournament_id: string|null; league_season_id: string|null}` to bare `object`, deleting even the nominal check. Separately, `lib/poolData.ts:188` does `const pool = poolRes.data as PoolData | null` over a `select('*')` — so replacing `tournament_id: string` with `competition: CompetitionRef` on `PoolData` yields an object with no `competition` key at runtime and zero errors at the producer. This is the identical `as`-cast hole v2 correctly identifies for `PredictionMode` in §6.3/S12 and misses for the type Layer 1 rests on.

**Failure.** Enforcement reduces to a runtime throw on World Cup paths. Concrete instance v2 does not list: `lib/analytics/entryAnalytics.ts:62-68` selects `'tournament_id, prediction_mode'` and calls `getScoringSource(admin, poolId, poolRow.prediction_mode)`. Under §6.1 that becomes `competitionRef(poolRow)`, which throws — `computePoolEntryAnalytics` throws, `writePoolEntryAnalytics` rejects, and the live analytics-sweep cron (jobid 15, `* * * * *`, `analytics_sweep_enabled = true`) stops refreshing `entry_xp_state` for all 623 World Cup pools, with the per-pool rejections swallowed into a `Promise.allSettled` errors array. Meanwhile the `as PoolData` producer ships `competition: undefined` and only the readers blow up, so `npm run build` is clean either way.

**Fix.** Three small changes. (1) Restore the structural parameter type on `competitionRef` and keep the throw as a belt. (2) Make `getPoolDataUncached` build the ref explicitly — `competition: competitionRef(poolRes.data)` — instead of `as PoolData`, so the single producer is checked at the one site that matters; type `createAdminClient()` with the generated `Database` generic if that is affordable. (3) Enumerate the pool selects feeding `getScoringSource` by grep (`entryAnalytics.ts:62` at minimum) and widen them in L3, rather than trusting a compiler that cannot see `any`.

### [HIGH] §7.1 prescribes `AND po.league_season_id IS NULL` on `shadow_detect_diffs`'s mismatch INSERT, and states the verification as "a `pg_get_functiondef` diff before/after must show exactly one added conjunct per function". Verified live: that INSERT is `FROM shadow_entry_totals s JOIN pool_entries pe ON pe.entry_id = s.entry_id` — two tables, no `pool_members`, no `pools`. There is no `po` alias in scope. The `coverage` subquery does have `pools po` and takes one conjunct cleanly.

**Failure.** An implementer following §7.1 literally writes an unresolvable alias and the `CREATE OR REPLACE` fails; or they add `pool_members JOIN pools` to the mismatch statement, which breaks v2's own stated verification rule and re-plans the only automated check on 623 pools' totals. Either way the predicate is provably unnecessary: with the `shadow_reconcile_adjustments` predicate applied a league entry can never acquire a `shadow_entry_totals` row, and the INNER join means absence cannot produce a diff — which v2 itself establishes when accepting W5.

**Fix.** Apply the predicate to the `coverage` subquery only (one conjunct, exactly as claimed — that is the site that would otherwise carry a permanently-red `league_pickem: {live:N, shadow:0}` key). Drop the mismatch-site predicate and record why in the migration header. Restate the verification as "one added conjunct in three functions; `shadow_detect_diffs` gains one conjunct in `coverage` and nothing in the mismatch insert."

### [HIGH] §5.6 asserts (inheriting S2) that `detectAndPushBadgesForPool` is "the ONLY writer of `entry_xp_state` (`:221`)". Verified false on live master: `lib/analytics/entryAnalytics.ts:268-278` `writePoolEntryAnalytics` upserts `entry_xp_state` directly, and it is driven by `app/api/cron/analytics-sweep/route.ts` — cron jobid 15, `* * * * *`, **active**, with `sync_settings.analytics_sweep_enabled = true` live. Its pool resolution is `pool_entries WHERE last_rank_update > watermark → member_id → pool_id`, with no competition filter of any kind. v2's §7.1 containment set lists four SQL selectors and misses this one entirely because it is TypeScript.

**Failure.** Two directions. (a) L5's exit criterion `xp_rows = eligible_entries` can go green via the sweep while `badges.ts:89-91` is still returning early on a null `tournament_id` — a false pass on the S2 fix, in the phase whose whole purpose is proving S2 fixed. (b) The sweep is a fifth global writer reaching league pools every minute, calling `computePoolEntryAnalytics`, which reads `matches` with `.eq('tournament_id', poolRow.tournament_id)` — `eq.null` under option A, zero rows, no error — and its per-pool failures are collected into an `errors[]` array rather than raised.

**Fix.** Name the analytics sweep as a fifth containment site in §7.1: `.is('league_season_id', null)` on its pool resolution with a logged skip count until the league analytics arm lands, then dispatch on `CompetitionRef`. Change L5's XP assertion from a row count to a provenance check — assert the row was written by the badge path (e.g. that `entry_xp_state.updated_at` moved within the badge fan-out, or run the assertion with the sweep's kill switch off).

### [MEDIUM] §6.1's fix for S6/N3 — make `getShadowReadPools` module-private and route all eight callers through `getScoringSource` per pool — converts one `sync_settings` read into one per pool on the highest-traffic World Cup pages. `readSource.ts:59-61` documents that `getShadowReadPools` is "intentionally NOT cached so the switch (and rollback) is instant", and the live `shadow_read_enabled_pools` value is a ~620-element JSON array. Today `app/pools/page.tsx:143`, `app/dashboard/page.tsx:204`, `app/profile/page.tsx:87`, `home-scoring/route.ts:125` and `activity/route.ts:601` each call it once and bucket in memory.

**Failure.** A dashboard or pools page listing N pools issues N `sync_settings` round-trips, each shipping the full ~620-id array, on every render — for pages that serve only World Cup pools. Against a database whose recorded architecture problem is round-trip count (1.5M calls at 6.9ms vs one set-based statement), this is a measurable regression introduced by a league fix on a completed competition's surfaces.

**Fix.** Keep the collapse — it is the right call and N3 is real — but memoize the flag read per request: wrap `getShadowReadPools` in `React.cache()` on the server, or give `getScoringSource` an optional pre-resolved `Set` parameter that the batch call sites pass once. Add "no additional `sync_settings` reads per pool" to L6's verification alongside the CI single-caller assertion.

### [MEDIUM] §11 L0 replaces the destructive re-score check (correctly, per W4) with "a read-only CTE recomputes expected `score_type / base_points / multiplier / total_points` over `shadow_match_scores ⋈ matches ⋈ pool_settings`". Recomputing `base_points`/`multiplier`/`total_points` from stored `score_type` + `stage` + `pool_settings` is exact and catches the pricing-hunk regression. Recomputing `score_type` is not: verified from the live body, `score_type` depends on `teams_match`, which depends on `shadow_entry_bracket`'s resolved pairs and the `prediction_mode = 'progressive'` branch. A CTE that reproduced that would be a hand-rolled second implementation of the thing it is checking — the documented "parity is not an oracle" failure.

**Failure.** `score_type` is precisely what the five `stage_has_scheduled_teams` substitutions control (verified: 2 occurrences prefixed `NOT`, 3 bare — v2's count is right). Invert one and knockout `teams_match`/`score_type` flip across ~78k stored rows. A CTE that reads `score_type` as an input is blind to it; a CTE that recomputes it is a fork. So L0's verification has a coverage gap on exactly the hunks it exists to guard.

**Fix.** Prove the substitutions by equivalence rather than by value diff — read-only, exact, two statements run BEFORE the edit: `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage = 'group')) FROM (SELECT DISTINCT stage FROM matches) s;` and `SELECT bool_and(mode_submits_per_round(prediction_mode) = (prediction_mode = 'progressive')) FROM (SELECT DISTINCT prediction_mode FROM pools) p;`. Both must return true, which proves each of the eight substitution sites is a semantic no-op on the remaining data. Keep the pricing CTE for base/multiplier/total.

### [MEDIUM] §7.4's KEEP-PERMANENTLY list names `mode_submits_per_round(text)` and `stage_has_scheduled_teams(text)` but omits `stage_uses_base_prices(text)`, while `lib/migrations/046_league_scoring.sql:474-478` — the file an implementer will read — lists all three as droppable. Verified live: no function body references `stage_uses_base_prices` (046d removed it), and `pg_depend` on `mode_submits_per_round(text)` is 0, confirming W2's premise that a DROP succeeds silently.

**Failure.** The asymmetry between v2's two-name list and 046's three-name list invites an implementer to reconcile them by dropping all three. Dropping `stage_uses_base_prices` is in fact harmless today, but the reconciliation that gets them there is the same motion that drops the other two, which then breaks `shadow_score_match`, `shadow_eligible_entries`, `shadow_finalize_totals` and `shadow_calculate_bonuses` inside a per-minute cron.

**Fix.** Enumerate all three by name in §7.4 with an explicit status each: two KEPT (live bodies reference them, `pg_depend` records nothing), one unreferenced-but-leave-it. And put the same three-line note as a header comment on `046_league_scoring.sql` next to its DO-NOT-RUN marker, since that file is where the droppable claim lives.

### [MEDIUM] L0 disarms cron jobid 8 (`sync-fixtures`) at step 2 but leaves jobid 19 (`shadow_reconcile_matches`, `* * * * *`), jobid 20 (`* /2`) and jobid 15 (`analytics-sweep`, `* * * * *`) armed through steps 3–8, which rewrite four shadow functions and delete 380 `matches` rows (cascading 380 `shadow_match_state` rows — verified `shadow_match_state_match_id_fkey ON DELETE CASCADE`). The live `shadow_score_match` opens with `IF v_stage IS NULL THEN RAISE EXCEPTION 'shadow_score_match: match % not found'`.

**Failure.** A reconcile tick that has already selected a league match id when step 5's DELETE commits raises and aborts. The tick is self-healing, but the error lands in the exact window where an operator is checking whether the revert damaged the World Cup, and it is indistinguishable from a botched function substitution. Every count L0 asserts is also being taken against a database three crons are still writing to.

**Fix.** Set `sync_settings.shadow_reconcile_enabled = false` for the duration of steps 3–8 — the switch already exists and `shadow_reconcile_adjustments` honours it at its first statement (verified). Confirm `shadow_reconcile_matches` reads the same key; if not, `UPDATE cron.job SET active = false WHERE jobid IN (19,20,15)` and re-arm alongside cron 8 in step 8. That makes every L0 count an assertion over a quiet database.

### [LOW] Two line references in L0 step 1 are wrong, and one instructs a change that is already present. v2 says to add `.eq('tournament_id', …)` to `lib/scoring/recalculate.ts:129` — that read already carries the filter (`recalculate.ts:128-131`: `.from('teams').select(...).eq('tournament_id', pool.tournament_id)`). And the genuinely unscoped `teams` read is at `lib/poolData.ts:181-186`, not `:201` (`:203` is the matches read, already scoped). W11 itself is real and correctly promoted — verified 68 rows in `teams`, 48 national plus 20 clubs, and `getPoolDataUncached`'s teams select carries no tournament filter.

**Failure.** An implementer applies the W11 fix twice in `recalculate.ts` (harmless) and looks for it at the wrong line in `poolData.ts`, where `:201` is a query that already passes review — so the one live World Cup contamination the step exists to fix can be marked done without being fixed.

**Fix.** Correct the citations: the single required edit is `.eq('tournament_id', pool.tournament_id)` on the `teams` select at `lib/poolData.ts:181-186`. Drop the `recalculate.ts:129` item.

## R.silent-wrongness — **sound-with-fixes**

**Were v1's findings actually fixed?** GENUINELY FIXED, not reworded — I re-verified each against live code/DB:

- W1 (recalculate re-key): REAL and properly fixed. `lib/scoring/recalculate.ts:74-77` is verbatim `.select('pool_id, tournament_id, prediction_mode')`; the early return at `:103-112` returns `{success:true, entriesProcessed:0}`. v2's throwing `competitionRef()` + widened select is a structural fix, and rejecting the reviewer's loose-`!=` as a *general* rule is correct.
- N1 (getScoringSource): REAL. `lib/scoring/readSource.ts:83-90` takes `predictionMode: string`, has no pool row, and line 88 already routes `league_pickem` to `'shadow'` (empty tables). Signature change to `CompetitionRef` is the right fix.
- S2 (badges tournament_id guard): REAL, verified at `lib/push/badges.ts:87-91`. Fix is correct as far as it goes — but see finding 1: it has no caller.
- S3 (round state machine): genuinely answered, not deferred. Every supporting number checks out live: 624 pools, 1 league pool, 38 `pool_round_states` rows on it, 121 stuck `state='locked'` rows, and the unbounded selects at `lib/auto-submit.ts:206-211` and `:385-388` are real (no `.range()`, no `.limit()`).
- S4 (fetchRoundMatches): genuinely *dissolved* by removing the submission gate, not patched — but that removal creates a new hole (finding 5).
- S5 (recalculatePool success-lie): genuinely fixed (`success:false` + `league_rescore_pool` + adjustment trigger) — but the same edit deletes the only call site of the push/badge fan-out (finding 1).
- S6/N3 (getShadowReadPools bypass), S7 (`badges.ts:376`), S8/N6 (46 `from('predictions')` sites — I counted exactly 46), S9 (mobile), S10/U7 (column names), S12 (PredictionMode re-declarations): all real, all correctly addressed.
- U4: real — `MATCH_COLUMNS` at `lib/poolData.ts:54` names `round_number`, and `:198` destructures only `{ data: matchesRaw }`. Keeping the column is the right call.
- N2: REAL and the most valuable new finding. `pg_get_functiondef('broadcast_pool_leaderboard()')` emits `total_points`/`current_rank`/`previous_rank` and **no** `point_adjustment` and **no** `scored_total_points`; `liveMerge.ts:76-97` compares and writes all six including both missing keys. Confirmed latent prod defect. But the proposed *fix* is broken — finding 3.

PARTIALLY FIXED:
- S1 (reveal gate): the direction is right and the deadline evidence is correct, but v2's own derived-state vocabulary reintroduces the leak — finding 4.

I found no finding that was merely reworded. The 5/3/1 price COALESCE I initially suspected is consistent with `lib/migrations/046_league_scoring.sql:176` and `admin/ScoringTab.tsx:156`, and all 624 `pool_settings` rows have non-null `group_*` — not a finding.</v1_findings_actually_fixed>

<parameter name="summary">v2's architecture is sound and its verification discipline is real — I re-checked ~20 load-bearing claims against live code and the database and found only one wrong (see finding 3). The fork boundary, the derived round state machine, the guard rule, and N2 are all correct. The remaining defects are two enumeration gaps of exactly the class v2 was built to close (a fixture-reader inventory that does not exist, mirroring the prediction inventory that does), one launch-blocker fix that would itself break the World Cup, and two second-order consequences of v2's own good decisions (derived `locked` state, and dropping the submission gate). None require rearchitecting; all are additive.

### [CRITICAL] The league scoring drain is SQL-only (pg_cron → `league_reconcile_fixtures()`), but the three Node side-effect pipelines it depends on have no caller. Verified: `detectAndPushBadgesForPool` has exactly two call sites, `lib/scoring/recalculate.ts:107` and `:336`, both inside `recalculatePool`; `fanOutResultPushes` likewise at `:104` and `:328`. §5.1's S5 fix replaces the early return at `recalculate.ts:103-112` — which today DOES fire both (`:104-108`) — with an immediate `success:false` and no side effects. §5.5 says `league_reconcile_fixtures` will 'fire XP/badges for the affected pools', but it is invoked as `SELECT public.league_reconcile_fixtures()` from pg_cron and cannot call TypeScript. `detectAndPushBadgesForPool` is the only writer of `entry_xp_state` (`badges.ts:221`) and the only caller of `computePoolEntryAnalytics` (`badges.ts:156`). The one Node cron that could substitute, `/api/cron/analytics-sweep`, is a DRAFT: not in vercel.json, kill switch defaults false, and it keys on `pool_entries.last_rank_update`, which v2's D6 mirror does not stamp.

**Failure.** Premier League season opens. Scoring is correct — `league_entry_totals` fills, the broadcast fires, the leaderboard moves. But no `entry_xp_state` row is ever written, so `app/api/pools/[pool_id]/leaderboard/route.ts:201-202` (`const matchPoints = stats ? sc.match_points : 0`) renders every member as 'Total 450 pts' beside 'Match 0 / Bonus 0', with empty form dots, 0% hit rate, zero streak and Level 1 for all 38 matchweeks. No badge is ever detected or pushed. `fanOutResultPushes` never runs, so `prediction_result`, `matchday_mvp` and `streak_milestone` pushes — a shipped feature — are silently dead for every league member all season. Every number is plausible; nothing errors; nothing logs. This is also a regression against v1, whose early return at least still fired both fan-outs. L5's own exit criterion `xp_rows = eligible_entries` is unachievable as designed, so the phase gate would fail without anyone knowing why.

**Fix.** Make the drain a Node cron, not a pg_cron entry: `/api/cron/league-reconcile` (`* * * * *`) RPCs `league_reconcile_fixtures()`, takes back the affected `pool_id[]`, then per pool awaits `detectAndPushBadgesForPool(poolId)` and calls `fanOutResultPushes()` — exactly the shape `recalculatePool:328-338` already uses. Keep `league_snapshot_ranks` in pg_cron. Add to L5's exit criteria: a league match completing produces at least one `prediction_result` push and one non-empty `entry_xp_state.last_five`.

### [CRITICAL] v2 mechanically inventories the 46 `from('predictions')` sites and buckets every one (§6.4), then never does the equivalent for fixtures. `grep -rn "from('matches')" app lib mobile components scripts` returns **95 sites**; v2 names roughly 15. Under option A `pools.tournament_id` is NULL for a league pool, and `.eq('tournament_id', null)` renders as `tournament_id=eq.null` — zero rows, HTTP 200, no error. §9.5 explicitly lists '/live response contracts' as untouched, and §6.6 argues the fork turns readers into *unreachable* code — true for the shadow engine, false for the app, where they become silent-empty. Unnamed anywhere in v2: `app/api/pools/[pool_id]/live/route.ts:107-112`, `app/api/pools/[pool_id]/leaderboard/route.ts:91-95`, `lib/push/match-results.ts:65,87`, `app/api/matches/[match_id]/{stats,scores,bracket-stats}/route.ts`, `app/api/users/[user_id]/activity/route.ts:634`, `app/dashboard/page.tsx:79,103,236,242`, `app/profile/page.tsx:145,258,344`, `app/pools/page.tsx:125`, `lib/email/segments.ts:305`.

**Failure.** Concrete worst case, /live: after L6 repoints `lib/poolData.ts:199-205` to `league_fixtures` but `/live` still reads `matches`, the route returns `completed_matches: 0` while the client holds N completed fixtures. `needsFullRefresh` (`liveMerge.ts:26-28`) is then true on every tick, so `PoolDetail.tsx:704` calls `router.refresh()` on the 30s poll AND on every leaderboard broadcast (debounced 1.5–5.5s at `:782`) — a permanent full-RSC refresh storm on every league pool page, during the exact window the product guarantees live standings. Even before that sequencing, `liveIds` is always empty, so `readMatchScoresNarrow` and `readEntryStats` never run: during a live PL fixture the leaderboard totals move via the broadcast while form dots, hit rate, streak and per-match scores stay frozen — the memory-documented 'RN home screen's form/accuracy/streak were dead this way', on the web. Separately, `/api/matches/[match_id]/*` 404s for every league fixture, killing the whole match-detail surface.

**Fix.** Produce the `.from('matches')` bucket table in the same form as §6.4 — repointed via a `fixtureStore(ref)` adapter / excluded with `.is('league_season_id', null)` + logged skip count / refused loudly / script arm — and land the ESLint rule confining `.from('matches')` to `lib/fixtures/` in **L1**, alongside the predictions rule, not L8. Add `/live` and `/api/matches/*` to the named repoint list.

### [HIGH] §1.7's replacement `broadcast_pool_leaderboard()` body — the code block an implementer will copy — contains `'point_adjustment', n.point_adjustment`, while the paragraph immediately below says v2 takes the `COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)` derivation instead. I dumped the column list: `shadow_entry_totals` is `entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at, bonus_points, total_points, final_rank, previous_final_rank` — there is no `point_adjustment`. PL/pgSQL resolves the reference at runtime, not at CREATE time, so the function deploys clean.

**Failure.** The function is shared: it is attached to `shadow_entry_totals` today and to `league_entry_totals` under this design. The first `shadow_finalize_totals` statement after deploy hits the AFTER-STATEMENT trigger, raises `column n.point_adjustment does not exist`, and aborts the transaction — which takes the totals write with it. Cron jobid 19/20 then fail every minute. The World Cup's 623 pools stop finalizing, and the fix advertised as the launch blocker becomes the outage. It would pass any `CREATE OR REPLACE` smoke test and fire only on the next real scoring pass.

**Fix.** Put the derivation in the code block, not only in the prose. Add to L5's verification, before the trigger is attached to anything: run the new function against a hand-inserted `shadow_entry_totals` update inside `BEGIN … ROLLBACK` and assert the emitted JSON carries all seven `LiveEntry` keys with `point_adjustment` equal to `total_points - match_points - bonus_points`.

### [HIGH] v2's derived state machine reopens S1. §3.4 assigns `state='locked'` to 'a future matchweek that is not the open one'. `lib/predictions/revealGate.ts:41` declares `LOCKED_ROUND_STATES = new Set(['locked','in_progress','completed'])`, and `isRoundLocked` (`:117-120`) returns true for any of them — the semantics being 'immutable pool-wide, therefore safe to show everyone'. With §6.3's fix routing league pools into the progressive branch, `computeReveal` returns `scope:'rounds'` containing **every matchweek except the single open one**, including all 30+ future ones. Nothing at the database layer prevents a future-matchweek pick existing: `enforce_league_prediction_before_lock` (§1.10) only fires once `lock_at <= now()`, `assert_league_prediction_pool` only checks the season, and the transcribed RLS policies have no round predicate. In the World Cup this is safe only because a `locked` knockout round has no fixtures with teams and therefore no picks — an accident of the bracket, not a rule.

**Failure.** Any member who pre-fills later matchweeks — a natural league behaviour, and reachable directly through the mobile PostgREST client or a scripted call — has those picks served to every other member immediately by `app/api/pools/[pool_id]/entries/[entry_id]/predictions/route.ts:175-195` and `bulk/route.ts:99-119`. It renders as a normal Results/Members tab, so nobody reports it. This is the exact rule `revealGate.ts`'s own header calls the one hard rule, and it is the finding v2 promoted to launch-blocker.

**Fix.** For a league, decide revealability from the deadline alone, ignoring the state string: `league_round_states.deadline` **is** `lock_at`, so `isDeadlinePassed(round.deadline, now)` is exactly correct and needs no new vocabulary. Either pass a `useStateVocabulary: false` flag into `computeReveal` for `ref.kind === 'league'`, or have `readRoundStates` null the `state` field for future league matchweeks before it reaches the gate. Add to L4's verification: store a MW38 pick while MW1 is open, then assert a second member's `/bulk` and `/entries/:id/predictions` responses contain none of it.

### [HIGH] §5.2 removes the submission gate from scoring (correct — it dissolves S4) and dismisses `pool_entries.has_submitted_predictions` as 'a UI affordance'. It is not. Four surfaces treat the flag as 'this member did nothing': `app/pools/[pool_id]/analytics/analyticsHelpers.ts:354-366` (`computeCrowdConsensus` drops every prediction whose entry lacks the flag), `:665-677` and `:722` (`computePoolWideStats` — `avgPoolAccuracy` computed over a subset, `totalEntries: submittedEntryIds.size`), `app/pools/[pool_id]/AnalyticsTab.tsx:427-436` (`if (submittedEntryIds.size < 2) return null` — the whole comparison section vanishes), and `app/pools/[pool_id]/admin/MembersTab.tsx:86,143-170` (`isProgressive = pool.prediction_mode === 'progressive'` is a literal, so a league pool falls to the `has_submitted_predictions` arm of `memberStatus`). Compounding it, the manual Submit route refuses partial matchweeks: `app/api/pools/[pool_id]/predictions/round/route.ts:121-127` returns 400 unless `predictedCount >= totalRoundMatches`. The route's own comment states the stakes: 'Half the app (Results tab, Form tab, prediction modals, mobile) decides "submitted or not" from has_submitted_predictions'.

**Failure.** A member predicts 9 of 10 MW7 fixtures. They cannot press Submit (400), so `has_submitted_predictions` stays false forever. Under v2 they score normally and appear on the leaderboard with points — while the admin Members tab shows them 'Pending' all season, their nine picks are excluded from crowd consensus and from pool-wide accuracy, `totalEntries` under-reports the pool size, and if fewer than two members ever press Submit the entire comparison section of the Analytics tab silently renders nothing. Every number displayed is internally consistent and wrong.

**Fix.** Have the league prediction write path set `has_submitted_predictions = true` on the entry's first saved prediction, in the same statement as N7's `predictions_submitted_at` (`.is('predictions_submitted_at', null)`). That restores the flag's stated invariant — 'true once the entry has submitted anything' — without reintroducing a scoring gate. Separately fix the `=== 'progressive'` literal at `MembersTab.tsx:86` to `usesRounds()`, and add MembersTab's `memberStatus` to §9.2's list (v2 currently lists that file only for `ViewPredictionsModal`).

### [MEDIUM] D6's mirror writes only `pool_entries.{match_points, bonus_points, scored_total_points, current_rank}`. It omits `previous_rank`, which is read directly off `pool_entries` at `app/dashboard/page.tsx:61,469-473`, `app/pools/[pool_id]/community/CommunityTab.tsx:954-955`, `community/DesktopSidebar.tsx:384`, `community/helpers.tsx:196-200` and `LeaderboardTab.tsx:789,814,1109` — and by the six mobile readers D6 exists to serve. It also omits `last_rank_update`, which is the only change-detector `/api/cron/analytics-sweep` uses (`pool_entries.last_rank_update > lastRun`), so that cron can never see a league pool even once enabled.

**Failure.** Every rank-movement indicator that does not go through `readEntryScoring` reads `previous_rank` as its stale World Cup value (NULL for a league entry). The ▲/▼ arrows on the mobile home screen and the 'moved up N places' cards in Banter and on the dashboard show nothing, permanently — the one visual that makes a live league leaderboard feel live. Nothing errors: NULL `previous_rank` is a legitimate 'no movement yet'.

**Fix.** Add `previous_rank` and `last_rank_update = now()` to the `league_finalize_totals` mirror, and add to L7's verification: `pool_entries.previous_rank = league_entry_totals.previous_final_rank` for every entry after a `league_snapshot_ranks` run.

### [MEDIUM] §9.2 fixes the World Cup match-count literal at `analytics/xpSystem.ts:489` (`entryPredictions.length >= 104`) and the `lightning_rod` denominator at `lib/push/badges.ts:453`, but there is a third instance in the same function that v2 never names: `lib/push/badges.ts:459`, `if (predictionCount >= 104) earnedIds.push('stadium_regular')`. It counts predictions with no competition scope at all.

**Failure.** A Premier League member crosses 104 stored predictions around matchweek 11 and is awarded `stadium_regular`, a badge whose copy describes a World Cup milestone. `badge_unlocks` is append-only, so — exactly as v2 argues for `lightning_rod` — it cannot be taken back, and it inflates the trophy case and the cumulative unlock counts for the rest of the season. The award looks earned; only the copy gives it away.

**Fix.** Same treatment as `:453` — denominator/threshold from the pool's own season fixture count via the `CompetitionRef`. Grep the file for the literal `104` as part of the §5.6 surgery rather than fixing named lines.

### [LOW] §7.5's Layer 3 asserts 'exactly one matchweek is in state `open` whenever now() < the season's last lock_at'. §3.4's own function cannot satisfy that. For a pool whose `start_mw` falls back to the `matchweek_count + 1` sentinel (created after the last lock — deliberate, and correct), no matchweek satisfies `matchweek_number >= s.start_mw`, so `open_mw` is NULL and **zero** matchweeks are open. The same is true for any pool during the window between the final matchweek locking and the season's last kickoff.

**Failure.** The cron alarm that §7.5 positions as the outcome-level safeguard — the layer that 'catches readers nobody thought of' — goes permanently red on a correct condition the moment one late pool exists. A safeguard that is red for a legitimate reason is a safeguard people learn to ignore, which is how the real failures it exists to catch get missed. Rank drift and read-path gaps are already outside its reach, so its credibility is the whole of its value.

**Fix.** Restate as: at most one matchweek is `open`, and exactly one whenever the season has a matchweek with `lock_at > now()` at or after the pool's `start_mw`. Encode the sentinel case as an expected zero rather than a violation.

## R.ui-reuse — **sound-with-fixes**

**Were v1's findings actually fixed?** All nine of my v1 findings (U1-U9) are genuinely fixed, not reworded — and four are fixed better than I proposed. U1 (PointsBreakdownModal): accepted with a concrete derived-key fix at :812-818 and :427, and v2 correctly adds two things I missed — the component's private STAGE_LABELS at :63-71 and the `isKnockout = stage !== 'group'` test at :1031. Verified live. U2 (analyticsHelpers `STAGE_ORDER.filter` at :269): accepted with append-unknown, and v2's refinement is correct — I verified `computeAccuracyByStage` has exactly one caller, `entries/[entry_id]/analytics/route.ts:197`, consumed only by `mobile/lib/api.ts:322`, so the blast radius genuinely is mobile and invisible to web QA. U3 (xpSystem `stage === 'group'` at :336/:498): accepted, inverted to a positive knockout test — but see new finding 4, the same construct survives in `lib/push/badges.ts:466` and `:460`, the file v2 already opens. U4 (dropping `matches.round_number`): resolved by not doing it — v2 keeps the column permanently and adds a browser check to L0. Better than my fix, which was to remove it from MATCH_COLUMNS. U5 (KnockoutStageForm PSO): accepted, `psoApplies` gating :289 and the draw branch at :40-46 (verified at :35-47). U6 (MatchCard raw stage token): accepted, routed through `roundLabel(matchweekKey(round_number))`; `getStageLabel` confirmed at :54-58. U7 (synthesis list missing stage/base_points/match_number): accepted and materially strengthened — §6.2 enumerates all 22 keys and §1.6 adds `base_points` and renames `points`→`total_points`. But see new finding 5: v2 dropped v1's fixture/team mapping table while claiming to supersede v1, so the larger synthesis is now unspecified. U8 (StandingsTab re-enable): accepted, re-enable dropped, `BaseTeamTable` correctly identified as the reusable piece; one imprecision remains, see new finding 8. U9 (broadcast payload vs LiveEntry): accepted and promoted to critical N2 — v2 did the verification I asked for, dumped the live function body, and found it emits neither `scored_total_points` nor `point_adjustment`. That is the correct outcome and the strongest single addition in v2.

v2 is a large, honest improvement and the architectural claim survives: the reuse boundary (MatchData / TeamData / EntryScoring) is right, the realtime leaderboard is genuinely table-agnostic once N2's trigger fix lands, and nothing in v2 or in my new findings forces a parallel UI — every fix is local to a shared component. On the second question: forking predictions does NOT drag the leaderboard, XP or badges into forking. `entryAnalytics.ts` stays the single owner of `entry_xp_state` (verified: only its two input reads at :70-77 and :112-132 are competition-scoped), `badge_unlocks` and `pool_entries` stay shared, and the XP engine is fed synthesised rows rather than a second engine. What v2 needs is surgery on shared rules, not a fork — and its surgery is incomplete in `lib/push/badges.ts` (finding 4). The serious gap is that v2's own new §3 decision (derived round state, zero `pool_round_states` rows) was not traced to its UI and write-path consumers: the submit route 404s, the admin Rounds tab errors, and — separately and worse — the save route's four unexamined `=== 'progressive'` gates make a league member unable to save a pick past their first submit or past 21 Aug 18:00. Findings 1, 2 and 3 are all one repoint away from fixed (`usesRounds` + `readRoundStates`), which v2 already prescribes elsewhere in the same document.

### [CRITICAL] `app/api/pools/[pool_id]/predictions/route.ts` — the hottest write path in the product — carries four `prediction_mode === 'progressive'` gates that v2 never examines. v2 §6.4 lists this file only as a `from('predictions')` repoint at :57/:277 and a 409 at :358; the gates at :81, :107, :156, :190 and :231 appear nowhere in v2. Three of them break a league pool. (a) :156-168 — league is not 'progressive', so the POST takes the `else` branch and rejects on the pool-wide `pools.prediction_deadline`. v2 §0.1 itself records that value on the live league pool as 2026-08-21 18:00Z. (b) :231 — `if (pool?.prediction_mode !== 'progressive' && entry.has_submitted_predictions) return 403`, and `predictions/round/route.ts:161-166` sets `has_submitted_predictions = true` on the first matchweek submit (deliberately, per its own comment). (c) :190 — the per-round open/deadline validation is gated on 'progressive' and so never runs for a league, leaving the silent-skip DB trigger as the only lock.

**Failure.** A member submits matchweek 1. From that moment `ProgressivePredictionsFlow.savePredictions` (which POSTs here on every autosave) gets 403 'Predictions already submitted' and the save bar reads 'Save failed' — for all 37 remaining matchweeks. Independently, from 18:00 on 21 Aug every save in the pool gets 403 'Prediction deadline has passed', so nobody can pick anything for the rest of the season. And because :190 is skipped, a save into an already-locked matchweek is accepted by the API, returns 200 with a fresh `lastSaved`, the UI shows 'Saved', and the BEFORE trigger drops the row — which is exactly the silent wrongness v2 §4.1 argues is acceptable *because* 'the UI shows the matchweek as locked before a member can hit it'. That justification rests on a gate v2 never repointed.

**Fix.** Replace the mode equality with `usesRounds(pool.prediction_mode)` at :81, :107, :156, :190 and :231 — the identical repoint v2 already prescribes for `page.tsx:87` and `PoolDetail.tsx:452`. Add the file to §9.2 and add one line to L4's verify: 'submit MW1, then save a pick in MW2 and confirm 200'.

### [HIGH] v2's §3.5 list of ten `pool_round_states` readers is short by at least six, and one of the omissions is the submit route itself. `app/api/pools/[pool_id]/predictions/round/route.ts:67-77` does `.eq('round_key', roundKey).single()` and returns `404 {error:'Round not found'}` when there is no row. Under v2 §3.1 a league pool holds **zero** rows in that table. Also missing from the list: `predictions/route.ts:83` and `:192`, `rounds/route.ts:43`, `app/pools/page.tsx:191`, `app/dashboard/page.tsx:268`, `admin/notify-round-open/route.ts:41`, `admin/users/[id]/route.ts:182`, `admin/pools/[id]/actions/route.ts:789`, `scripts/verify-bulk-reveal-gate.ts:68` and `:120`.

**Failure.** Nobody can submit a matchweek. The Submit button in `ProgressivePredictionsFlow` POSTs to that route and gets a 404 for every matchweek, all season. That in turn means `entry_round_submissions` and `predictions_submitted_at` are never written by anything — which contradicts v2 §5.2's own statement that those rows are 'still written by the manual Submit route'. Separately, `app/pools/page.tsx:186` and `app/dashboard/page.tsx:265` gate their round-state read on `=== 'progressive'`, so a league pool card falls back to `has_submitted_predictions` and (once finding 1's flag is set at MW1) reads 'all set' for the rest of the season regardless of what the member has actually picked.

**Fix.** Enumerate the full reader set in §3.5 and route every one through `readRoundStates`, including the two write gates. `verify-bulk-reveal-gate.ts` needs it too — v2 already flags that script as returning CLEAN on a pool it never examines, and this is the second mechanism by which it does so.

### [HIGH] The admin **Rounds** tab is rendered for league pools and is a dead error. `PoolDetail.tsx:996` adds it whenever `usesRoundFlow`, which is `usesRounds(pool.prediction_mode)` at :275 — true for `league_pickem`. `:1948` mounts `RoundsTab`. `RoundsTab.fetchRounds` (`admin/RoundsTab.tsx:66-80`) GETs `/api/pools/[id]/rounds`, which v2 §3.6 deliberately keeps refusing at `rounds/route.ts:37` (`prediction_mode !== 'progressive'` → 400). `RoundsTab` throws on `!res.ok`, catches, and calls `showToast('Failed to load rounds data','error')`. Neither `RoundsTab.tsx` nor `rounds/route.ts` appears anywhere in v2's 21-module list or its §3.5 reader list.

**Failure.** Every time a league pool admin opens the Rounds tab they get a red error toast and an empty table — permanently. The improved refusal message v2 §3.6 proposes ('matchweek state is derived from the fixture calendar and cannot be set') never reaches them, because `fetchRounds` discards the response body and substitutes its own generic string. And the admin has no surface anywhere showing the 38 matchweek locks and their state, which is the one thing the derived design most needs to be visible.

**Fix.** Two lines, pick one. Either hide the tab for a league pool (`usesRoundFlow && ref.kind !== 'league'` at `PoolDetail.tsx:996`), or — better, since the deadlines matter — have `rounds/route.ts` serve the derived rows through `readRoundStates` and have `RoundsTab` hide its Open/Extend buttons when the pool is a league.

### [HIGH] The U3 class survives in `lib/push/badges.ts` — the file v2 §5.6 already opens for surgery. v2 lists three fixes there (`:89-91`, `:376`, `:453` lightning_rod) and inverts the knockout proxy in `xpSystem.ts` at `:336` and `:498`, but leaves the two identical constructs in `badges.ts`: `:466` `if (match && match.stage !== 'group') earnedIds.push('showtime')`, and `:460` `if (predictionCount >= 104) earnedIds.push('stadium_regular')`. Both are the exact patterns v2 accepted as findings in the sibling file.

**Failure.** A synthesised `regular_season` is not `'group'`, so the first league exact score awards **Showtime** — 'Correct exact score in a knockout match', 80 XP, Gold, 'Very Rare'. And a league entry passes 104 predictions around matchweek 11 of 38, awarding **Stadium Regular** — 'Predict all 104 matches'. Unlike the `xpSystem` copies, these write to `badge_unlocks`, which is append-only by design (`:254-272`), and each unlock fires an APNs push (`:309`). So they are wrong awards that cannot be withdrawn and that actively notify the member. This is worse than the version v2 fixed, because `xpSystem`'s output is recomputed each run while `badge_unlocks` is not.

**Fix.** Apply the same two fixes v2 already wrote for the sibling file: the positive knockout test at `badges.ts:466`, and the league season's fixture count as the denominator at `:460` (same change v2 gives `lightning_rod` at `:453`). Add both rows to §5.6's table.

### [MEDIUM] v2 declares it 'supersedes v1 entirely — a reader needs nothing from v1', then drops v1 §4.1's `league_fixtures → MatchData` and `league_clubs → TeamData` mapping tables without replacing them. §6.2 enumerates all 22 keys of the *score* row precisely because U7 showed an omitted key silently breaks a consumer — and then leaves the *fixture* mapping, which strictly more components read, unspecified anywhere in the document.

**Failure.** An implementer working only from v2 has no statement of what `MatchData.round_number`, `.stage`, `.match_number`, `.home_team_id` or `.match_date` should carry for a league fixture, and each omission is silent. Concretely: `competitionRounds.matchInRound` (`lib/competitionRounds.ts:158`) requires `stage === 'regular_season' && round_number === n`, so `ProgressivePredictionsFlow:157`'s `matchesInRound` returns [] for every matchweek if either is missing — 38 empty prediction screens. `ProgressivePredictionsFlow:200` does `byId.get(match.home_team_id)` against a `TeamData` map, so club ids must land in `team_id` or every card renders 'TBD v TBD'. `:220` sorts on `match_number`. All of it renders as plausible empty state.

**Fix.** Restore the two mapping tables as an explicit section of v2 (they were correct in v1 §4.1, rows 1-2), and extend L6's typed test — which v2 already specifies for the score arm's `stage`/`base_points`/`match_number` — to cover the fixture arm's `round_number`, `stage`, `match_number` and `home_team_id`/`away_team_id`.

### [MEDIUM] §10 undercounts the Expo surface by roughly the same factor v2 just corrected on the web. It names five mobile items for L8/L9 (`usePredictions`, `useMatchDetail`, `useHomeData:366-369`, `PoolInfoTab:466`, `api.ts:258`). `grep -l "quarter_final|round_32" mobile/` returns **14 files**, and several are direct twins of findings v2 accepted for the web: `mobile/app/pool/[id]/breakdown.tsx:23,578` is U1 verbatim (`STAGE_ORDER.map` over the same seven literals); `mobile/components/pool-detail/ProgressivePredictionWizard.tsx:43` declares `type RoundKey = 'group' | 'round_32' | … | 'final'` — a **closed** seven-value union, so a matchweek cannot be represented at all, let alone rendered; `mobile/lib/usePoolRounds.ts:7-19` hardcodes the same seven keys; `mobile/components/pool-detail/PredictionsTab.tsx:50` computes `isProgressive = predictionMode === 'progressive'`; plus `mobile/app/(tabs)/results.tsx:51-53,175,214`, `mobile/app/pool/[id]/entry/[entryId].tsx:34-36,97,157`, `mobile/lib/stage.ts:10-16`.

**Failure.** Not a live failure while v2's L3 hard-block holds — that block is the right call and it is what keeps this at medium. But the L8 estimate is wrong by ~3×, which is the same error v2 diagnosed in v1 §4.1 and corrected for the web only. Since the block is the only thing between a league pool and the mobile app, an underestimated L8 is an indefinitely extended block, and the mobile wizard in particular is not a repoint — its round type has to be widened the way `ProgressivePredictionsFlow` already was in commit 150ab5e.

**Fix.** Run the same mechanical derivation §9.2 used for the web across `mobile/` and put the result in §10 step 4 as a named list. State explicitly that `ProgressivePredictionWizard`'s `RoundKey` union and `usePoolRounds`'s key list are the mobile analogue of the work already done on the web flow, not a repoint.

### [MEDIUM] v2 §5.2 removes the submission gate from scoring and §6.4 excludes league pools from `lib/auto-submit.ts:288` — so after those two decisions, **nothing but a manual Submit ever writes `entry_round_submissions` or `pool_entries.has_submitted_predictions` for a league entry**. v2 acknowledges 'half the app reads the flag' and calls the rows 'UI affordances', but never says what that half of the app then displays.

**Failure.** A member who picks every fixture and never presses Submit scores normally (correct, and the point of §5.2) while every submission surface says they have done nothing — permanently. `RoundStatusCard`'s submission chip reads unsubmitted for a locked, scored matchweek; `app/pools/page.tsx:186-215` and `app/dashboard/page.tsx:265-280` fall back to `has_submitted_predictions` for league pools and render the card as not-started all season; `mobile/lib/useHomeData.ts:42,342-372` keeps nudging 'make your picks' for a matchweek that finished a week ago; the admin Members 'submitted' column is wrong for the same members. Note this pulls against finding 1: making saves work requires `has_submitted_predictions` *not* to gate them, while these surfaces require it to be set — both are satisfiable, but only if the design says so.

**Fix.** Pick one and state it. Either have the league write path set `entry_round_submissions.has_submitted` + `pool_entries.has_submitted_predictions` when a matchweek's `lock_at` passes with ≥1 stored `league_prediction` (a per-season sweep, cheap, and it keeps one story with N7's move of `predictions_submitted_at` to first save), or derive the chip from 'has ≥1 league_prediction in a locked matchweek' and stop reading the flag on league surfaces.

### [LOW] §9.2 and §9.4 both say `LeagueTable` 'mounts in the `ResultsView.tsx:255-266` slot'. That slot is inside `{stageTab === 'group' && hasGroupResults && (…)}` (verified at `results/ResultsView.tsx:253-266`, with `hasGroupResults` at `:148-153` testing `m.stage === 'group'`). A league pool never has a `group` tab and never satisfies `hasGroupResults`.

**Failure.** Following §9.2 literally builds `LeagueTable` and mounts it behind a condition that is false for every league pool — the component ships and never renders. Downstream of that, v2 correctly kills the `StandingsTab` re-enable (U8) but then leaves the league with no standings surface at all, which for the Premier League is the competition's signature artifact showing nowhere in the product.

**Fix.** Name the gate change alongside the mount: the slot's condition becomes matchweek-tab-aware (or the table renders on the 'All Matchweeks' tab), and say in §9.3 whether a league pool gets a standings surface in v1 or deliberately does not.

## R.completeness — **needs-rework**

**Were v1's findings actually fixed?** Mostly real fixes, one narrowed rather than closed.

GENUINELY FIXED (substance, not wording): S3 (round state machine) — v2 §3 is a first-class section with a designed SQL function, four measured arguments, and live evidence (121 stuck rows); it is a real answer, not a restatement. S8/N6 (prediction reader inventory) — re-derived mechanically to 46 sites and bucketed, with the ESLint gate moved from L8 to L1. S9 (Expo) — §10 is new, names the exposure mechanism (usePredictions.ts:291-299 swallowing the upsert error) and sequences an OTA. S2/S7 (badges.ts) — three separate defects at named lines with distinct fixes. U1-U8 — all carry file:line and a stated failure; U4 and U8 correctly reversed v1's position rather than papering over it. W5 — v2 says outright "reviewer is right, v1 was wrong."

NARROWED, NOT CLOSED — and it is the finding on my lens: S11 ("notification / lifecycle sweeps absent"). v2 §8 names four sweeps and calls the section done. There are at least eight, plus two live edge functions the repo does not contain. firePendingDeadlineWarnings (cron 9, active), firePredictReminders (cron 13, active), firePendingWeeklyRecaps (cron 11, active) and fanOutResultPushes are all absent from v2 in any form. S11 was answered for the sweeps v1's reviewer happened to list, which is the same failure mode as v1's round-state omission one level down.

WEAKENED BY A NEW OMISSION: S5. v2's fix turns recalculate.ts's league early-return into `success:false`. That block at lib/scoring/recalculate.ts:103-112 is currently the ONLY code that fires fanOutResultPushes, detectAndPushBadgesForPool and invalidatePoolCache for a league pool. The S5 fix deletes the last surviving side-effect hook without replacing it (finding 1).

The fork itself is sound and should be kept — the DDL (§1), the pools touch (§2), the containment predicates (§7) and the derived-round decision (§3, D7) all survive this lens. What does not survive is the plan: a league pool cannot be created, cannot submit a matchweek, and once scored fires none of the side effects that make a scored matchweek visible. Three lifecycle joints are simply absent, and one of them (post-scoring fan-out) needs a component the design does not contain, which is why this is needs-rework rather than sound-with-fixes. Separately, v2 is blind to the fact that the live auto-submit/auto-archive cron is a Supabase Edge Function whose source is not in this repository, so a whole class of v2's mitigations is aimed at code that production never executes.

### [CRITICAL] No owner for post-scoring side effects. v2 §5.5 says `league_reconcile_fixtures()` will "then fire XP/badges for the affected pools" — but it is a plpgsql function and cannot call TypeScript. Verified: `fanOutResultPushes` (lib/push/match-results.ts:79) has exactly two callers, lib/scoring/recalculate.ts:104 and :328; `detectAndPushBadgesForPool` (lib/push/badges.ts:79) and `invalidatePoolCache` (lib/poolData.ts:85) are called from the same two places. `shadow_reconcile_matches` (read live via pg_get_functiondef) is pure SQL and fires none of them — today the World Cup gets its side effects from the Node engine that still runs under `prod_scoring_enabled=true`. v2 removes the Node engine for league pools entirely (§5.1 replaces recalculate.ts:103-112 with `return success:false`), which also deletes the three side effects that block currently DOES fire for league pools today.

**Failure.** Matchweek 1 scores correctly in `league_match_scores`, the realtime leaderboard moves, and then: zero result pushes for all 380 fixtures (the single most important in-play notification in a pick'em); `entry_xp_state` never written, so app/api/pools/[pool_id]/leaderboard/route.ts:201-202 renders "Total 450 pts" beside "Match 0 / Bonus 0", empty form dots and Level 1 for everyone all season — verbatim the failure §5.6 claims to fix, now reintroduced one layer up; `getPoolBulkDataCached` never invalidated. The tell is already in the DDL: `league_fixtures.result_pushes_sent_at` (§1.4) is a column with no writer and no reader anywhere in v2.

**Fix.** Add a `league_score_events(pool_id, fixture_id, processed_at)` queue table written by `league_reconcile_fixtures`, plus `/api/cron/league-post-score` that drains it and calls a league arm of `fanOutResultPushes`, `detectAndPushBadgesForPool` and `invalidatePoolCache`. Register it as a pg_cron job in L5. Add to `league_scoring_health` (§7.5): every completed fixture has `result_pushes_sent_at IS NOT NULL`. Note `match-results.ts:84` selects its score table by `isProdScoringEnabled` — a fourth score-table mechanism beside getScoringSource, badges.ts:376 and recaps.ts:311; fold it into the same CompetitionRef decision.

### [CRITICAL] v2 is blind to what the live crons actually run. pg_cron jobid 3 `auto-submit-and-archive` (ACTIVE, `0 0 * * *`) posts to `https://ujthamlehjyubbzxbnes.supabase.co/functions/v1/auto-submit` — a Supabase Edge Function whose source is NOT in this repository (there is no `supabase/functions/` directory). I read its deployed body: it contains hand-copied duplicates of `autoSubmitDraftEntries`, `autoSubmitProgressiveRounds` and `autoArchivePools`, with a literal seven-key `ROUND_MATCH_STAGES` and `.eq("tournament_id", pool.tournament_id)`. Meanwhile `lib/auto-submit.ts` and `lib/auto-archive.ts` are reachable only from `app/api/cron/auto-submit/route.ts`, which no cron calls (`vercel.json` is `{}`; no pg_cron job targets that path).

**Failure.** Every containment predicate v2 adds in §3.6 / §4.3 / §8 (`.is('league_season_id', null)` on lib/auto-submit.ts:103, :288, and the auto-archive repoint) is a no-op in production, and the verification steps that check them will pass against dead code. Concretely, if a league pool ever holds `pool_round_states` rows (which it will — see finding 8), the deployed edge function does `stages = ROUND_MATCH_STAGES["mw_7"] ?? []` → `.in("stage", [])` → no matches → `continue` for every entry, and then flips the round to `in_progress` unconditionally at the end of the loop. Every matchweek transitions open→in_progress with zero submissions and nothing ever re-opens it. This is also the real explanation for v2 §3.3(a)'s 121 stuck rows: `autoCompleteProgressiveRounds` exists only in lib/auto-submit.ts and therefore never ran in production at all.

**Fix.** Add the seven ACTIVE edge functions to the design's surface inventory (auto-submit, send-countdown-emails, send-match-results, send-deadline-reminders, send-round-deadline-reminders, send-weekly-recap, send-countdown-retry) and state for each whether it is repointed, excluded or left inert. For auto-submit specifically: either add `.is("league_season_id", null)` to its three pool selects and redeploy, or retire the edge function and point cron jobid 3 at `/api/cron/auto-submit` so there is one implementation. L0 should assert which of the two is live before any predicate is written.

### [CRITICAL] Nothing in v2 creates a league pool. `app/api/pools/create/route.ts:56` returns 400 when `tournament_id` is missing and `:68` inserts it; `app/api/admin/branded-pools/route.ts:103` and `:135` do the same. Under §2.2's `pools_exactly_one_competition` CHECK a league pool must have `tournament_id IS NULL`, so both routes fail. Neither file is named in any phase of §11. The catalogue the wizard offers is also not `app/competitions.ts` (that is only the landing-page marketing strip, `app/page.tsx:7`) — it is `components/pools/CreatePoolModal.tsx:124`, which reads `tournaments` and filters by `hasCompetitionEnded(t.end_date)`. `league_seasons` is never queried. `mobile/app/create-pool.tsx` is a third copy of the same shape.

**Failure.** L9 ("wizard league option; app/competitions.ts → 'open'") ships and nobody can create a Premier League pool: the modal lists zero competitions (D8 identifies this but attributes it to the marketing strip), and if the request were forced through, the pool INSERT violates the CHECK and returns a 500. D8 also mis-scopes the outage — it is not "the wizard offers zero competitions between L0 and L9", it is "there is no code path that produces a league pool at L9 either".

**Fix.** Add to L1/L3: both create routes accept `league_season_id` and validate exactly-one; `seedPoolRoundStates` is not called for a league (finding 8); `prediction_deadline` is forced NULL (finding 5). Add to L8: one catalogue loader that unions `tournaments` (filtered by end_date) and `league_seasons` (filtered by `last_kickoff_at`), consumed by CreatePoolModal, branded-pools admin, and mobile create-pool.

### [CRITICAL] A league member cannot submit a matchweek. `app/api/pools/[pool_id]/predictions/round/route.ts:68-78` reads `pool_round_states` with `.single()` and returns `404 'Round not found'` when the row is absent. §3.1 decides a league pool holds zero rows, and §3.5's list of readers to route through `readRoundStates` does not include this route. Two more write-gate readers are also missing: `app/api/pools/[pool_id]/predictions/route.ts:83` and `:192`, both guarded by the literal `pool?.prediction_mode === 'progressive'`.

**Failure.** Every "Submit matchweek" press 404s, all 38 weeks, for every member — the same shape as v1's missing state machine, one route deeper. And because `predictions/route.ts:80` and `:190` test the literal `'progressive'`, a `league_pickem` pool skips round validation entirely and falls through to `canEdit = !has_submitted_predictions && !predictions_locked && !isPastDeadline` at `:206`, where `isPastDeadline` uses the pool-wide `prediction_deadline` (2026-08-21 18:00Z on the live pool). From 21 Aug the web PUT path reports the whole season as uneditable while `enforce_league_prediction_before_lock` would happily accept MW2–MW38. `predictions/route.ts:70-73` also counts `matches` by `tournament_id` (NULL) for the denominator, producing the "0 of 0" the design elsewhere says to refuse loudly.

**Fix.** Add predictions/round/route.ts:69, predictions/route.ts:83 and :192 to §3.5's readRoundStates list, and replace the three `=== 'progressive'` literals with `usesRounds(mode)` (lib/competitionRounds.ts:222) in the same sweep §9.2 already applies to PoolDetail.tsx:452 and page.tsx:87. L4's verification must include "a league member submits matchweek 1 through the real route and gets 200".

### [HIGH] v2 never decides what `pools.prediction_deadline` holds for a league pool. §4.3 calls it "meaningless", §0.1 records that the live pool has it set to 2026-08-21 18:00Z, and §6.3 uses that value as the reveal-gate leak — but no phase sets it, nulls it, or constrains it. At least six live consumers key on it: lib/push/deadline-warnings.ts:46-50, lib/push/time-based.ts:157-163, the deployed auto-submit edge function, app/api/pools/[pool_id]/predictions/route.ts:75, lib/predictions/revealGate.ts:66, and PoolInfoTab.

**Failure.** Both answers are wrong and the design picks neither, so an implementer picks by accident. Set: one deadline warning before MW1 and never again, the PUT path locks for the season (finding 4), the reveal gate leaks every future matchweek (S1), and the auto-submit edge function iterates the pool daily forever. NULL: S1 and finding 4 disappear, but every pre-lock nudge in the product goes silent for 38 weeks with no error — the shipped T-24h/T-6h/T-1h escalation and the daily predict reminder both select on `.not('prediction_deadline','is',null)`.

**Fix.** Choose NULL, add `CHECK (league_season_id IS NULL OR prediction_deadline IS NULL)` alongside `pools_exactly_one_competition` in §2.2 so it cannot drift, and repoint `firePendingDeadlineWarnings` and `firePredictReminders` at `league_matchweeks.lock_at` (finding 6). The CHECK is what makes S1's fix durable rather than dependent on whoever creates the next pool.

### [HIGH] §8 covers four sweeps; there are at least eight, and the four it omits are the ones whose cadence actually matches a league. Missing: `firePendingDeadlineWarnings` (lib/push/deadline-warnings.ts:34; pg_cron jobid 9, `*/30 * * * *`, ACTIVE); `firePredictReminders` (lib/push/time-based.ts:146; jobid 13, daily 17:00, ACTIVE); `firePendingWeeklyRecaps` (lib/push/recaps.ts:280; jobid 11, Sundays 20:00, ACTIVE) — which reads `.from('match_scores')` directly at :311, a fifth score-table selector; and `fanOutResultPushes` (finding 1). §8 also does not note that `firePendingMatchdayRecaps` reads `match_scores` at recaps.ts:123, not shadow.

**Failure.** A Premier League pool gets zero lock reminders across 38 matchweeks and zero weekly recaps — for a weekly competition those are the two highest-value cadences the product owns, and both fail silently because an empty result is a valid one. The weekly recap in particular is the natural "your week in the league" moment and it will simply never fire.

**Fix.** Extend §8's table to all eight, each with a stated disposition. Deadline warnings and predict reminders repoint at `league_matchweeks.lock_at` and the derived open matchweek; weekly recap gains a `league_match_scores` arm keyed on `calculated_at`; matchday recap groups league fixtures by kickoff date. Keep §8's own rule — "a sweep that excludes rows must log how many it excluded" — and apply it to all eight.

### [HIGH] §3.2 states the cost of the derived-round decision as "ten-odd consumers read pool_round_states directly, two in Expo", and D7 rests that decision on it. `grep -rn "from('pool_round_states')"` over app/ lib/ mobile/ components/ scripts/ returns 41 sites across 27 files. Unlisted and load-bearing: the three write-gates in finding 4; app/api/pools/[pool_id]/predictions/unlock/route.ts:80; app/api/admin/pools/[id]/actions/route.ts:789; app/api/admin/users/[id]/route.ts:182 and .../actions/route.ts:311; app/api/admin/notify-round-open/route.ts:41; app/api/account/delete/route.ts:112; app/pools/page.tsx:191; app/dashboard/page.tsx:268; lib/roundMatches.ts:65; scripts/verify-bulk-reveal-gate.ts:68 and :120.

**Failure.** D7's one acknowledged cost is understated roughly threefold, and the omitted set contains the routes that decide whether a pick is accepted and whether an admin can unlock an entry. verify-bulk-reveal-gate.ts reading the table directly at :68/:120 means the privacy check §6.3 relies on cannot see a league pool's round state even after the reveal-gate fix — the same class as N3.

**Fix.** Re-derive the list mechanically and put it in §3.5, and move the `no-restricted-syntax` rule confining `.from('pool_round_states')` to `lib/rounds/` into L1 so it gates the sweep instead of documenting it afterwards — exactly the treatment §6.4 already gives `.from('predictions')`.

### [HIGH] `seedPoolRoundStates` still writes 38 `pool_round_states` rows for a league pool and v2 never names it. lib/poolRoundStates.ts:67-87 has an explicit `league_pickem` branch, `insertLeagueRounds` at :105-150 inserts one row per matchweek, and both creation routes call it (app/api/pools/create/route.ts:135, app/api/admin/branded-pools/route.ts:217). §3.7 deletes the 38 rows on the one existing pool but nothing stops the next pool from seeding 38 more.

**Failure.** §3.1's "a league pool holds ZERO pool_round_states rows" is false for every pool created after L1, and §3.6's central safety claim — that autoSubmitProgressiveRounds and friends are "naturally league-free, because they select from pool_round_states and a league pool has no rows there" — collapses. Stored rows and the derived function then disagree at every reader that has not yet been routed through readRoundStates, which is the two-gate disagreement §3.2(3) explicitly rejects. Combined with finding 2, the deployed edge function walks those rows and deadlocks the season at matchweek 1.

**Fix.** Delete the `league_pickem` branch and `insertLeagueRounds` from lib/poolRoundStates.ts, make the function refuse a league pool outright, and remove `|| prediction_mode === 'league_pickem'` from both create routes. Add an assertion to `league_scoring_health` (§7.5): `count(*) from pool_round_states pr join pools po using (pool_id) where po.league_season_id is not null` = 0.

### [HIGH] There is no admin path to correct a league fixture. The World Cup has one: app/admin/super/MatchesTab.tsx writes `matches` directly at :289, :385, :440, :533 and :686 (set live, enter score, complete, relinquish) and fans out `/recalculate` per pool at :329, :409, :599, :725; app/api/matches/[match_id]/scores/route.ts:51,84 does the same; app/api/admin/match/[id]/relinquish exists. v2 creates `league_fixtures` with exactly one writer — the §11 L2 sync arm — and no human override anywhere in the plan.

**Failure.** When api-football reports a Premier League result late, wrong, or not at all — an abandoned match, a VAR correction after full time, a postponement recorded as a 0-0 — nobody can fix it. §5.5's `league_reconcile_fixtures` only reacts to a change in the feed, so a fixture the feed never corrects stays wrong permanently and 38 matchweeks of picks are scored against it. The World Cup ran for a month with a human able to intervene; a 9-month season with no override is a materially worse operational position than the competition v2 is replacing.

**Fix.** Add to L5 or L8: a super-admin league fixture editor writing `league_fixtures` (goals, status, is_completed, kickoff) and calling `league_rescore_pool` for the affected pools, plus a `manual_override boolean` column the L2 sync arm respects so the feed cannot silently undo a correction. The World Cup's relinquish route is the precedent for the override flag.

### [MEDIUM] Mid-season joiners have no per-entry start. `pool_entries` (verified live) has no start-matchweek column. §2.2 adds `pools.league_start_matchweek` and §3.4 derives round state from it, but that is pool-level only — a member who joins an existing pool at matchweek 12 inherits the pool's start. v2 records no decision either way.

**Failure.** A member joining at MW12 of 38 has zero `league_predictions` for MW1–11, scores zero for them, and sits permanently bottom of the leaderboard with no explanation on screen. In a World Cup that never happened because everyone joined before the single deadline; over a 9-month season, late joining is the normal case, and the product's stated purpose is bringing people in. `league_finalize_totals` (§5.3) aggregates all `league_match_scores` per entry with no start filter, so nothing mitigates it.

**Fix.** Either add `pool_entries.league_start_matchweek` (or derive it from the entry's `created_at` against `league_matchweeks.lock_at`) and have `league_finalize_totals` aggregate only from that matchweek forward, or record explicitly in §12 that late joiners start from zero and add a UI line saying so. Silence here produces the plausible-looking wrong answer the house rule forbids.

### [MEDIUM] §3.4's `o` CTE picks the single soonest-locking matchweek with `LIMIT 1`, so exactly one matchweek is ever `state='open'`. Meanwhile `enforce_league_prediction_before_lock` (§1.10) accepts a write to any fixture whose matchweek has not locked. The UI and the database therefore disagree about what a member is allowed to do.

**Failure.** A member going away for two weeks in October cannot pre-fill MW9 and MW10 even though both calendars are published and both locks are in the future — and the restriction is invisible, because MW9 simply renders as `locked`. This is the same two-gate disagreement §3.2(3) uses to argue against a stored deadline, reintroduced in the derived function. It is also a silent product decision: nobody chose "you may only pick next week" for a competition whose whole 38-week calendar exists in August.

**Fix.** Return `state='open'` for every matchweek at or after the pool's start whose `lock_at > now()`, and let the client default to the soonest. Keep `deadline` per matchweek so §5.2's eligibility and the lock trigger are unchanged. If one-at-a-time is genuinely wanted, record it as a decision in §12 with the reason.

### [MEDIUM] §6.5 says `pool_match_prediction_accuracy` gets "TS dispatch at the one caller, lib/poolData.ts:327". There are three: lib/poolData.ts:327, app/api/pools/[pool_id]/crowd/route.ts:39 and :52, and app/api/pools/[pool_id]/entries/[entry_id]/analytics/route.ts:157.

**Failure.** Two of the three keep calling the World Cup function against a league pool and get `[]` with no error. The crowd route feeds the Banter crowd-stats surface ("63% of the pool picked City") and the analytics route feeds the entry analytics page — both render as "no data yet" indefinitely, which is indistinguishable from a pool where nobody has picked.

**Fix.** Route all three through the same CompetitionRef dispatch, and state the caller count from a grep rather than from a reading — the same discipline §6.4 applied to `from('predictions')` and §6.1 applied to `getShadowReadPools`.

### [MEDIUM] The two public branded surfaces are absent from v2. app/play/[slug]/page.tsx:77 calls `getTournamentSummary(pool.tournament_id)` whose signature is `(tournamentId: string)` (app/play/[slug]/getTournamentSummary.ts:79) — NULL under option A; the function's `ROAD_STAGES` at :44-50 is six hardcoded World Cup stages, `:91` scopes to `tournament_id`, and `:96-99` derives `phase='pre'` whenever total=0. app/play/[slug]/page.tsx:60 and app/tv/[slug]/page.tsx:33 both compute `mode` with a ternary that has no `league_pickem` arm.

**Failure.** The public acquisition page and the big-screen TV board for a Premier League pool show the pre-tournament layout all season, a "Road to Glory" tracker of Groups→R32→…→Final, and the label "Full Tournament". Memory records both consumers share the component and that a green build is not verification here; this is a customer-facing surface with no automated check and no mention in v2's L8 browser list.

**Fix.** Add both to L8: a league arm of `getTournamentSummary` reading `league_fixtures` with a matchweek progress strip instead of ROAD_STAGES, phase derived from `completed_fixture_count` vs `fixture_count`, and the `mode` ternary replaced by the widened `POOL_MODE_INFO` lookup §9.2 already introduces for lib/poolModeInfo.ts:14.

### [MEDIUM] No cache-invalidation hook for a pure-SQL engine. `invalidatePoolCache` (lib/poolData.ts:85) wraps `revalidateTag`, which only runs in a request context; its only callers are lib/scoring/recalculate.ts:110 and :343. `league_reconcile_fixtures` is a plpgsql cron and cannot reach it, and §5.1's `success:false` removes the one call that currently fires for league pools.

**Failure.** `getPoolBulkDataCached` (lib/poolData.ts:504, 45s TTL, live behind `pool_cache_enabled=true`) keeps serving the pre-goal payload while the realtime broadcast has already moved the leaderboard — predictions, match scores and the leaderboard visibly disagree on the same screen for up to 45 seconds during a live matchweek. It self-heals, which is exactly why nobody will report it.

**Fix.** Fold the invalidation into the post-score drain of finding 1 — one `invalidatePoolCache(poolId)` per affected pool, in a request context, which is what the Next.js cron route gives you for free.

### [LOW] pg_cron jobid 15 `analytics-sweep` is ACTIVE at `* * * * *` (gated off by `sync_settings.analytics_sweep_enabled`). It selects work from `pool_entries.last_rank_update` (app/api/cron/analytics-sweep/route.ts:75-79). §5.3's `pool_entries` mirror writes match_points, bonus_points, scored_total_points and current_rank — not `last_rank_update`.

**Failure.** If the sweep is ever enabled — it is the designed successor to the badges.ts XP path and is already scheduled — league entries are never selected, so `entry_xp_state` goes stale for league pools only, silently, while World Cup pools stay fresh. A future engineer turning the switch on will see it work.

**Fix.** Add `last_rank_update = now()` to the §5.3 mirror's diff-aware write, and add it to §7.5's health assertions.

### [LOW] app/api/admin/notify-round-open/route.ts is not mentioned in v2. It reads `pool_round_states` at :41 and already carries a league branch at :65-68 (`.eq('stage','regular_season').eq('round_number', selector.roundNumber)` against `matches`, scoped by `tournament_id`).

**Failure.** After L0 empties `matches` of regular_season rows and `tournament_id` is NULL, an admin pressing "notify round open" on a league pool sends a notification announcing 0 matches, or finds no round state and does nothing — either way with a success response. §3.6 says the round routes should refuse a league with an explanatory message; this one was missed.

**Fix.** Give it the same explicit refusal §3.6 gives rounds/route.ts:37 and rounds/[round_key]/state/route.ts:69: matchweek opening is derived and cannot be announced by hand. Route its round-state read through readRoundStates.

### [LOW] No season-end story. §1.1 omits a `status` column on `league_seasons` and says to "derive from last_kickoff_at", but nothing in v2 ever reads `last_kickoff_at` for that purpose — there is no league equivalent of `hasCompetitionEnded` (lib/competitionFormat.ts, consumed at components/pools/CreatePoolModal.tsx:124), no final-standings notification (none exists for the World Cup either), and no season-rollover path to 2027/28.

**Failure.** A finished Premier League season stays offered in the wizard indefinitely (the same stale-copy failure app/competitions.ts's header comment was written to prevent), and the only thing that ends a league pool is lib/auto-archive.ts's 15-days-after-last-match sweep. The last matchweek of a 9-month competition passes with no moment: no winner declared, no email, no push, no UI change until the archive fires two weeks later.

**Fix.** Add `hasSeasonEnded(last_kickoff_at)` next to `hasCompetitionEnded` and use it in the catalogue loader of finding 3; add a season-complete notification to the L9 scope or record explicitly in §12 that there is none in v1.


---

# G. Gap research commissioned for v2

## G.1 Round state machine — recommendation: **derived-no-state**

A league pool should hold ZERO `pool_round_states` rows. Matchweek state is a pure function of the season calendar, computed in SQL at read time.

**The argument FOR storing rows** (steelmanned, then answered):
1. *Ten-odd consumers read `pool_round_states` directly, two of them in the Expo app* (`mobile/lib/useHomeData.ts:366-369`, `mobile/components/pool-detail/PoolInfoTab.tsx:466`, plus `app/pools/[pool_id]/page.tsx:89`, `bulk/route.ts`, `predictions/unlock`, `entries/[entry_id]/predictions`, `send-pending-reminders:137`, `send-template:89,394,583`, `admin/pools/[id]/route.ts:85`). With no rows they return `[]` — the codebase's signature silent-empty. **This is the single real cost and I am not minimising it.** Answered by serving the derivation through a view with identical column names and routing every reader through one `lib/rounds/read.ts`, the same adapter mechanism §3.4 already chose for predictions. The two mobile sites need an OTA.
2. *`opened_by` audit trail.* For a league nobody opens anything. Nothing to audit.
3. *Admin deadline override.* Real in the World Cup — 240/201/262 pools carry an identical hand-set deadline for final/round_16/semi_final, i.e. one super-admin bulk decision, not 250 individual ones. But a league's deadline is `min(kickoff)` of the matchweek, which is **already what the live DB trigger enforces** (`enforce_prediction_before_kickoff`, verified by `pg_get_functiondef`: for `stage='regular_season'` it computes `min(match_date)` over the round and silently drops later writes). A stored deadline that disagrees with that trigger produces either a UI that closes early while the DB still accepts picks, or an "open" matchweek whose saves vanish with no error. Storing the deadline **creates** a two-gate disagreement that derivation cannot have.
4. *Cost of 38 rows × every pool.* Not the row count — 38 × 624 is trivial. It is 38 × N **transitions**, each of which a cron must get right.

**The argument AGAINST storing, which wins on measured evidence:**

**(a) The cascade already fails at 15% over seven rounds.** Live, today: 121 `pool_round_states` rows across **42 of 281 progressive pools** are still `state='locked'` a month after the final. In **58** of those the *previous* round is `completed` — the cascade ran, the predecessor finished, and the successor still never opened (round_16 21, third_place 22, round_32 10, quarter_final 3, semi_final 2). Seven pools' `group` round never opened at all. That is the exact failure this task names, already in production, over 7 rounds. A league has 38.

**(b) "Games in hand" structurally deadlock a completion-gated cascade.** `autoCompleteProgressiveRounds` (`lib/auto-submit.ts:429-430`) advances only when `roundMatches.every(m => m.is_completed)`, and only from `in_progress`, which only `autoSubmitProgressiveRounds` sets (`:346-352`), which only fires on a non-null past deadline (`:206-211`). Postpone one MW7 fixture to April — routine in the Premier League — and MW7 never completes, so MW8…MW38 never open. For the World Cup a knockout round genuinely cannot be played out of order; **for a league, out-of-order completion is a normal feature of the season.**

**(c) The cascade has a hard 1,000-pool ceiling that presents as "the matchweek never opened".** `lib/auto-submit.ts:206-211` and `:385-388` both select across *all* pools with no `.range()` and no `.limit()`. A World Cup pool has at most one open round and they staggered; a league pool has exactly one open matchweek and **every pool in the season crosses its deadline at the same instant** (Saturday 12:30). At 1,000+ league pools PostgREST truncates silently, and the untruncated tail never transitions — no error, no log.

**(d) The reason the World Cup needs a cascade does not exist in a league.** A knockout fixture has no teams until the previous round resolves — hence `allTeamsAssigned` at `lib/auto-submit.ts:492` and the state-route guard at `rounds/[round_key]/state/route.ts:103-120`. All 380 Premier League fixtures exist with real club names in August (verified: 380 rows, 38 matchweeks, 10 each, first kickoff 2026-08-21 19:00Z). There is nothing to wait for, so there is nothing to make an actor responsible for.

**(e) Mid-season creation stops being a special case.** 45 of 281 World Cup progressive pools (16%) were created after the first kickoff. `lib/poolRoundStates.ts:105-150` handles this with a careful `completed`/`open`/`locked` seeding branch. Derived, the same rule falls out of the calendar with no branch and no code.

**(f) It is cheaper, not dearer.** Derivation reads 38 pre-aggregated `league_matchweeks` rows that are **per-season**, shared by every pool of that season — versus 38 rows per pool read separately. Given that reads are 70.3% of DB time (`project_scalable_architecture`), that is a material win, not a tax.

**What IS stored, so nobody is misled by the label:** the calendar (`league_matchweeks.lock_at` + aggregates, already in the design §1.3), per-entry submissions (`entry_round_submissions`, shared, and — see below — deliberately NOT load-bearing for points), and optionally one nullable integer `pools.league_start_matchweek`. No per-pool, per-round rows.

**Retain / revert verdict on the two earlier-attempt files:**
- `lib/competitionRounds.ts` — **RETAIN, with surgery.** It is pure, has 23 unit tests, and touches no table. `matchweekKey`/`matchweekNumber` (strict `mw_N` parsing — a key that round-trips differently creates two rows for one matchweek), `sortRoundKeys` (numeric matchweek ordering — lexically `mw_10` precedes `mw_2` and matchweeks render in the wrong order), `roundLabel`/`roundShortLabel`, `usesRounds` all earn their place. **Delete** `leagueRoundDefs` and `roundDefsFor` (`:106-126`) — they take `RoundableMatch[]`, the `matches`-table shape the fork removes — and make `nextRoundKey` (`:176`) bracket-only, since a league has no successor concept once nothing "opens".
- `lib/roundMatches.ts` — **REVERT/DELETE.** Its whole body is `.from('matches').eq('tournament_id',…)` with a `stage='regular_season' AND round_number=N` arm (`:33-47`). League fixtures live in `league_fixtures` behind a `matchweek_id` FK, so that arm is unreachable by construction and what remains is a World Cup stage query with a league branch bolted on — exactly what the decision removes. Preserve its one durable idea (return the error rather than an empty list, `:44`) in the bracket-only replacement.

**What opens matchweek N+1:** **The clock. Nothing else. There is no actor, no cron, no row, and no dependency on matchweek N completing.**

Precisely: matchweek N+1's state becomes `'open'` at the instant `league_matchweeks[N].lock_at <= now()` — the same instant N stops being open. The `o.open_mw` subquery is `ORDER BY lock_at, matchweek_number LIMIT 1` over matchweeks whose lock is still in the future, so the transition is atomic, gapless, and evaluated fresh on every read. For the imported 2026/27 calendar that means MW2 opens at 2026-08-21 19:00:00Z, the moment MW1 locks.

Three properties that the current cascade does not have:

1. **No completion gate.** MW8 opens on its own schedule whether or not MW7's postponed fixture has been played. Contrast `lib/auto-submit.ts:429-430` (`roundMatches.every(m => m.is_completed)` gating `:511-519`'s auto-open) — the mechanism that has left 58 World Cup rounds `locked` behind a `completed` predecessor.
2. **No per-pool work.** The expression is per-*season*. One 38-row calendar drives every pool of that season, so the cost does not scale with pool count and there is no unbounded cross-pool select to truncate.
3. **Failure is not persistent.** A stored transition that is missed stays missed forever. A derived state that is momentarily wrong (say the calendar was briefly stale) is correct on the very next read, with no backfill.

**Exactly one matchweek is `'open'` per pool at any instant** — deliberately matching the World Cup's shape so `ProgressivePredictionsFlow.tsx:86` (`roundStates.find(rs => rs.state === 'open')`), the `/rounds` route's `currentOpenRoundKey` (`rounds/route.ts:101-102`) and `mobile/lib/useHomeData.ts:369`'s `.eq('state','open')` all keep working unchanged. Note that the DB lock trigger would happily accept a pick for MW23 in August; under this design the UI simply does not offer it. That makes "one matchweek at a time" a **display policy, not a security boundary** — and flipping to pick-ahead later is a one-line change to the CASE (drop the `matchweek_number = open_mw` arm and let every `lock_at > now()` matchweek read `'open'`). See open questions.

**Notification is decoupled and idempotent.** A "Matchweek N is open" push/email and a "locks in 24h" reminder fire off `league_matchweeks.open_notified_at` / `lock_reminder_sent_at` — a **per-season** watermark, 38 rows total, driving one set-based fan-out across every pool of the season. A failed or skipped send therefore cannot block the state, which is the coupling that broke round_32 on 2026-06-28 (see the header comment in `app/api/admin/notify-round-open/route.ts:12-23`).

**Made impossible by construction:** **Failure A — a matchweek that never opens.**

*Why the stored design cannot rule it out:* opening is an event performed by an actor. `autoCompleteProgressiveRounds` must find the round `in_progress` (`lib/auto-submit.ts:385-388`), which requires `autoSubmitProgressiveRounds` to have seen it `open` with a past non-null deadline (`:206-211`), which requires whoever opened it to have set a deadline, and then the next round must be `locked` (`:473`), non-empty (`:490`) and fully team-assigned (`:492-493`). Six conditions, each a `continue`, none logged as an error. Measured outcome: 121 rows across 42 of 281 pools still `locked` after the tournament ended, 58 of them behind a `completed` predecessor.

*Why the derived design rules it out:* `state='open'` is `ORDER BY lock_at, matchweek_number LIMIT 1` over `WHERE lock_at > now() AND fixture_count > 0 AND matchweek_number >= start_mw`. That expression is **total over the calendar and monotone in time**. It cannot stall, because nothing in it references the previous matchweek, its completion, its submissions, or its deadline. It cannot skip, because it is ordered by `lock_at` rather than by ordinal, so a matchweek brought forward or pushed back is still picked up in real lock order. It cannot be missed, because it is evaluated on every read rather than written once. **There is no actor to fail.** The postponement case that deadlocks the cascade — one MW7 fixture moved to April — simply leaves MW7 reading `in_progress` while MW8…MW38 open on schedule.

The only residual way a matchweek is never pickable is the importer never creating its fixtures, which is a data defect, not a state-machine defect, and it is loud at three layers: L1's import assertion (38 matchweeks × 10 = 380 fixtures), the `(fixture_count = 0) = (lock_at IS NULL)` CHECK, and a `league_calendar_health` alarm on any matchweek of an active season with `fixture_count = 0` — run as a CI fixture and a cron, the same shape as §3.5's Layer 3.

**Failure B — a matchweek that opens and contains no fixtures.**

*Why the stored design cannot rule it out:* rows are seeded from a fixture snapshot at pool-creation time (`lib/poolRoundStates.ts:111-147`) and never re-derived. If the feed later empties a matchweek, the `open` row survives with nothing behind it. `autoCompleteProgressiveRounds` then hits `if (roundMatches.length === 0) continue` (`lib/auto-submit.ts:427`) and skips it forever, and the emptied round becomes a permanent blocker. The pre-existing comment at `roundMatches.ts:9-13` shows the team already knew this class: `.in('stage', [])` is not an error, it is a valid query returning zero rows that reads downstream as "no fixtures yet".

*Why the derived design rules it out — three independent reasons, any one sufficient:*
1. `lock_at` **is** `min(kickoff_at)` over the matchweek's fixtures. With zero fixtures the aggregate is NULL, and `NULL > now()` evaluates to NULL, not true — so the `open_mw` subquery cannot select it. Emptiness and openness are computed from the same fact; they cannot disagree.
2. An explicit `fixture_count > 0` conjunct in the same subquery, and a `WHEN mw.fixture_count = 0 OR mw.lock_at IS NULL THEN 'locked'` arm ahead of every other arm in the CASE.
3. `CHECK ((fixture_count = 0) = (lock_at IS NULL))` — the two can never drift apart at rest. If the maintenance trigger ever leaves a stale count, the **write raises** instead of the read rendering a plausible lie. That is the house rule applied to a data invariant: a crash beats a wrong answer.

Reason 3 is load-bearing and it exposed a bug in the design as written. The §1.10 sketch's `UPDATE … FROM (SELECT … FROM league_fixtures GROUP BY matchweek_id)` **inner-joins**: a matchweek that just lost its last fixture disappears from the aggregate subquery and is never touched, so `fixture_count` stays stale-nonzero and `lock_at` stale-non-NULL — precisely an empty matchweek that still reads open. The corrected trigger LEFT JOINs from the matchweek side and `COALESCE`s to zero, and the CHECK is what would have caught it.

**Failure C, which nobody has named — silent truncation making both of the above happen at scale.** `lib/auto-submit.ts:206-211` and `:385-388` select round states across all pools with no `.range()`. Every league pool crosses its deadline at the same instant, so past ~1,000 league pools PostgREST truncates with no error and the tail never transitions. Derivation has no cross-pool select in the state path at all; the only unbounded read is the `pool_round_states_all` view, which is why it carries the "always filter by pool_id" warning and the ESLint boundary rule.

## G.2 UI reuse — honest verdict

The reuse claim holds in SHAPE and fails on COST, and §4.1's "Untouched" list is the specific thing that is wrong. Holds in shape: choosing MatchData/TeamData/EntryScoring as the boundary is correct, no parallel UI is required, and three of the four load-bearing assets really are free — ProgressivePredictionsFlow is already format-aware through lib/competitionRounds (nothing to change), admin/RoundsTab already labels and sorts matchweeks, and the leaderboard/Banter/live-merge path is genuinely table-agnostic. Fails on cost: §4 budgets 7 small branches plus 2 new components. The real figure is 28 branches, 3 rewrites and 3 new components. §4.1's "Untouched" row names six consumers and is wrong on five of them — PointsBreakdownModal renders blank, AnalyticsTab/Form's shared helper returns [], MembersTab's own predictions modal renders blank, PoolInfoTab hides its deadline list, and the XP engine behind LeaderboardTab and CommunityTab writes wrong data. §4.2's proposal to re-enable the standings tab is actively harmful: it mounts a 629-line group-partitioned component that would ship twelve empty group cards behind an A–L selector from a one-line config change. Two things the design does not cost at all: the pool-admin ScoringTab (1,398 lines offering six knockout multipliers and a penalty-shootout price a league engine will never read) and the /play and /tv branded surfaces (a hardcoded bracket ladder and the literal string 'FIFA World Cup 2026'). And one ordering point that decides whether the component fixes work: the three CRITICAL/HIGH silent-empties all trace back to §1.6 and §3.4 omitting stage, base_points and match_number from the league read projection. Fix the components without fixing lib/scoring/readSource.ts's 22-column synthesis and the blank sections just move. Plain summary: reuse the UI, yes — but not "almost everything is untouched". Roughly two thirds of the league-reachable front end needs a deliberate edit, and nine of those edits are the difference between a league pool that works and one that shows a member a confident, wrong, entirely plausible screen.

**Totals:** 44 front-end components/modules carry World Cup stage, group, bracket or fixed-round vocabulary. Honest split: 10 REPOINT (contain the vocabulary but are correctly gated or fail safe — zero edits), 28 BRANCH (need a small edit inside the existing component; the file, its layout and its styling all survive), 3 REWRITE (StandingsTab.tsx, results/GroupStandingsComparison.tsx, play/[slug]/getTournamentSummary.ts + BrandedLandingClient.tsx — the bracket assumption is structural and reuse is not possible), 3 NEW (LeagueTable, MatchweekPicker, and a league fixture-admin surface with no World Cup equivalent since league_fixtures is invisible to app/admin/super/MatchesTab.tsx). Of the 28 branches, 9 are silent-wrongness rather than cosmetics — the project's documented recurring failure mode, none of which a green build or a type check will catch: PointsBreakdownModal renders a blank Match Points section under a correct total; admin MembersTab's View Predictions modal renders blank for every league member; analyticsHelpers returns [] so the Expo app's accuracy breakdown is empty; xpSystem fires Knockout King on every correct league pick and Showtime on every exact, writing inflated XP and levels onto the SHARED leaderboard and Banter; xpSystem's Stadium Regular badge fires at 104 of 380; poolModeInfo's `?? full_tournament` fallback tells a league member 'One deadline covers the whole tournament. All 104 matches'; page.tsx:87 leaves roundStates empty so every matchweek reads 'locked' and nobody can pick; page.tsx:98 can write seven World Cup round keys into a league pool's pool_round_states; PoolInfoTab hides the entire per-round deadline list. Six of the branch sites are private re-declarations of the same seven-stage label map (lib/tournament.ts:134, PointsBreakdownModal:63, PoolInfoTab:29, XPProgressSection:836, analyticsHelpers:113, admin/super/StatsTab:67, admin/super/PoolsTab:135, admin/super/TemplatesTab:418, admin/MatchesTab:41, community/helpers:304, DashboardClient:181, ProfilePage:125) — twelve copies in total, none of which the compiler links, which is why the design's audit missed most of them.

## G.3 Revert, corrected

**Preserving 046d:** "Never run a captured file. Do the function revert as a token-level regexp_replace over the LIVE pg_get_functiondef output, guarded on an exact expected occurrence count, then EXECUTE the result -- the same mechanism 046e itself used. This structurally cannot touch the pricing lines, because the only strings being rewritten are the two predicate calls.\n\nWHY THE OBVIOUS ROUTE IS WRONG: drafts/2026-08-14_pre046_shadow_rollback.sql:71-76 restores 'CASE WHEN m.stage = ''group'' THEN COALESCE(ps.group_exact_score,5) ELSE COALESCE(ps.knockout_exact_score,5) END'. The live body at def-lines 48-54 instead reads a single base for every stage: 'COALESCE(ps.group_exact_score, 5) AS base_exact / COALESCE(ps.group_correct_difference, 3) AS base_gd / COALESCE(ps.group_correct_result, 1) AS base_win'. Running that file restores the retired second base, which double-counts the group-to-knockout ratio that migration 042 already folded into the stage multipliers. Only 26 of 623 pools have group_exact_score = knockout_exact_score, so roughly 597 pools' knockout points would change on the next re-score of any completed World Cup knockout match -- and shadow_entry_totals has broadcast_pool_leaderboard_ins/upd attached, so the wrong numbers would be pushed live to clients. There are now 78,233 stored knockout rows sitting on the single-base result.\n\nEXACT SUBSTITUTIONS (occurrence counts verified live, assert each before writing):\n  shadow_score_match      -- 'mode_submits_per_round(po.prediction_mode)' -> 'po.prediction_mode = ''progressive''' , expect exactly 3\n  shadow_score_match      -- 'NOT stage_has_scheduled_teams(stage)' -> 'stage <> ''group''' , expect exactly 2, APPLY THIS ONE FIRST\n  shadow_score_match      -- then bare 'stage_has_scheduled_teams(stage)' -> 'stage = ''group''' , expect exactly 3 remaining (5 total minus the 2 NOT-forms)\n  shadow_eligible_entries -- 'mode_submits_per_round(po.prediction_mode)' -> 'po.prediction_mode = ''progressive''' , expect exactly 1\n  shadow_finalize_totals  -- same, expect exactly 1\n  shadow_calculate_bonuses-- same, expect exactly 1\n\nThe NOT-form must be substituted before the bare form. Substituting the bare form first yields 'NOT stage = ''group''', which Postgres parses identically but which is not byte-identical to the pre-046 text at drafts/2026-08-14_pre046_shadow_rollback.sql:125 and :158 ('stage <> ''group'''), and byte-identity is the only cheap verification available.\n\nCORRECTION TO THE DESIGN: section L0 and review finding 3 both say stage_has_scheduled_teams is a 3-site substitution. It is 5 sites in 2 distinct forms. A 3-site revert leaves 2 live references and the predicate function can then never be safely dropped.\n\nSHORTCUT THAT IS SAFE: shadow_eligible_entries and shadow_finalize_totals contain no pricing expression, so their hunks in the rollback file (lines 249-266 and 270-end) can be run verbatim. Only shadow_score_match's hunk (lines 24-245) is poison. shadow_calculate_bonuses has no hunk at all.\n\nR20 DATA: leave shadow_match_scores and shadow_entry_totals entirely alone. There are 0 league rows in shadow_match_scores, so the league revert never touches them. Do not restore backup_shadow_match_scores_pre_r20 (286,872 rows) or backup_shadow_entry_totals_pre_r20 (4,270 rows) -- those are the pre-046d two-base numbers and restoring them undoes both 046d and R20.\n\nDO NOT USE THE PLAN'S OWN VERIFICATION STEP. L0 says to 're-score one completed World Cup match per stage and assert byte-identical output'. shadow_score_match is not a read: it DELETEs from shadow_match_scores, UPSERTs into it, then UPSERTs shadow_entry_totals, which fires the leaderboard broadcast. There is no dry-run flag. Verify by static text assertion on pg_get_functiondef instead -- assert the def still contains 'COALESCE(ps.group_exact_score, 5)       AS base_exact' and contains ZERO occurrences of 'knockout_exact_score'. That is a pure read and it proves the same thing."

**Missing rollback artifacts:**
- shadow_calculate_bonuses -- migration 046e (live version 20260814231126) has NO rollback text anywhere in the repo. drafts/2026-08-14_pre046_shadow_rollback.sql was captured at 18:35 on 2026-08-14, hours before 046e was applied at 23:11, so it covers only three of the four functions. lib/migrations/046_league_scoring.sql:503-511 documents 046e as a 9-line comment and explicitly states it was applied by having the database rewrite the function from its own pg_get_functiondef output -- so no forward SQL text exists either, let alone an inverse.
- Migration 046d (live version 20260814214332, 'shadow_single_base_price_align_042') has NO migration file in the repo at all. It is referenced only in prose at lib/migrations/046_league_scoring.sql:481-496 and in two drafts. The live shadow_score_match body is the ONLY authoritative copy of the single-base pricing that must be preserved.
- lib/migrations/046_league_scoring.sql is an ANTI-artifact: at :176-180 it still creates the two-base stage_uses_base_prices pricing CASE, and at :94 it creates a function that no longer exists live. Re-running this file -- the only 046 file in the repo, written idempotently with CREATE OR REPLACE -- silently undoes 046d. None of the three review passes caught this; they flagged only the rollback file.
- drafts/2026-08-14_pre046_shadow_rollback.sql:71-76 is a poison hunk inside an otherwise-valid artifact, and the file's own header at line 12 says 'To roll back: run this whole file.' The header is wrong and needs correcting alongside a DO-NOT-RESTORE marker on those six lines.
- No artifact of any kind covers the league DATA. There is no capture of the 380 matches rows, the 20 teams rows, the tournaments row, the 380 shadow_match_state rows, or -- most importantly -- the live league pool c16a9a56 with its 3 members, 3 entries, 1 pool_settings row and 38 pool_round_states. The plan's inventory does not mention the pool, the round states, or shadow_match_state at all.
- No isolated revert commit exists for the front-door code. app/competitions.ts and components/pools/CreatePoolModal.tsx were changed inside commit 16c3cdc ('matchweek prediction UI and league pool creation'), which also contains work worth keeping, so `git revert` is not usable and the edits must be made by hand.
- Migration 024's down-migration at lib/migrations/024_multi_competition_league_support.sql:70-73 drops tournaments.external_provider / external_league_id / external_season / format. This is a WRONG artifact -- running it breaks World Cup fixture sync, because syncTargets.ts:69 reads all four for every competition and the World Cup row itself carries external_league_id=1.
