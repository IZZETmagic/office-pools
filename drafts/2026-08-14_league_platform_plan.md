# League platform — plan

> **Status:** approved in session 2026-08-14. Phase 0 in progress.
>
> **Ryan's calls, 2026-08-14:**
> 1. **A league is its own format, not `progressive` in disguise.** Do not reuse a World Cup
>    knockout-shaped mode. §3.1 is rewritten accordingly.
> 2. **v1 ingestion = regular season, any league.** Playoff rounds skipped with a reason.
> 3. **Start at Phase 0.**
> **Supersedes:** `drafts/2026-07-30_league_path_plan.md` (still correct in premise; three of its
> design conclusions change below, and its scope was one league).
> **Scope change from Ryan, today:** build this for **league competitions in general**, not the
> Premier League specifically. Team count varies (18 / 20 / 24), matchweek count follows from it,
> and lower divisions add promotion playoffs. Start with the main European leagues, which were
> assumed to have no playoffs. **That assumption is wrong for half of them — see §2.**

---

## 1. Verified state, 2026-08-14

Everything in this section was checked today against production or the current tree, not carried
forward from the July draft.

| Claim | Status |
|---|---|
| Migration 024 **not applied**. `tournaments_tournament_type_check` = `('world_cup','euros','copa_america')`; `matches_stage_check` has no `regular_season` | ✅ confirmed in prod |
| Only one `tournaments` row exists (FIFA World Cup 2026) | ✅ confirmed |
| The **live** `shadow_score_match` gate reads `WHEN stage='group' THEN true / WHEN prediction_mode='progressive' THEN true / … / WHEN pth IS NULL OR pta IS NULL THEN false` | ✅ read from `pg_get_functiondef`, not from the draft SQL file |
| The **live** price lookup reads `CASE WHEN m.stage='group' THEN group_* ELSE knockout_* END` | ✅ confirmed |
| The stage **multiplier** `CASE` already falls through to `1` for an unknown stage | ✅ confirmed — `regular_season` needs no multiplier work |
| `sync-fixtures/route.ts:270` announces every non-`group` completion as `knockout_result` | ✅ confirmed |
| `sync-fixtures/route.ts:67-70` still reads three env globals for tournament / league / season | ✅ confirmed |
| `pools_prediction_mode_check` = `('full_tournament','progressive','bracket_picker')` | ✅ confirmed |
| `prediction_mode` is branched on at **270 sites** in web+lib and **85** in mobile | ✅ counted |
| `readSource` gates on `shadow_read_enabled_pools`, an **allowlist** — a pool not in it reads prod | ✅ confirmed; list currently holds all 623 pools |
| `prod_scoring_enabled = true` — the Node engine still writes | ✅ confirmed |
| Auto round-opening **is not zero code** — `lib/auto-submit.ts:439` already completes a round and opens the next one, deadline defaulted to 2 h before its first fixture | ✅ read; **this corrects the programme's "zero code"** |

### One new number that sizes the mispricing

The July draft called the knockout-rate billing "wrong anyway" without quantifying it. Of the 623
pools in `pool_settings`, only **26 have `group_exact_score = knockout_exact_score`**. Group exact
ranges 5–100; knockout exact ranges 5–200. So a league pool inheriting a normal template would be
billed at roughly **double**, not marginally off. It is a real wrongness, not a rounding detail.

---

## 2. ⚠ The premise correction — Europe's top leagues are not uniform

I queried `/fixtures/rounds` on api-football for ten European leagues, season 2025. This is the
feed's own round vocabulary, which is what `parseRound()`
([importLeagueSeason.ts:106](../lib/integrations/apiFootball/importLeagueSeason.ts)) consumes.

| League | Rounds | Round-label phases | Verdict |
|---|---|---|---|
| Premier League (ENG) | 38 | `Regular Season` | ✅ clean |
| La Liga (ESP) | 38 | `Regular Season` | ✅ clean |
| Serie A (ITA) | 38 | `Regular Season` | ✅ clean |
| Bundesliga (GER) | 35 | `Regular Season`, **`Final`** | ⚠ playoff tail |
| Ligue 1 (FRA) | 35 | `Regular Season`, **`Final`** | ⚠ playoff tail |
| Primeira Liga (POR) | 35 | `Regular Season`, **`Final`** | ⚠ playoff tail |
| Eredivisie (NED) | 36 | `Regular Season`, **`Semi-finals`, `Final`** | ⚠ playoff tail |
| Championship (ENG) | 48 | `Regular Season`, `Semi-finals`, `Final` | ⚠ playoff tail (expected) |
| Jupiler Pro League (BEL) | 60 | `Regular Season`, `Championship Group`, `Relegation Group`, `Conference League Group`, `Quarter-finals`, `Semi-finals`, `Final`, … | 🔴 **ordinal collision** |
| Premiership (SCO) | 46 | **`1st Phase`**, `Championship Group`, `Relegation Group`, `Quarter-finals`, `Semi-finals`, `Final` | 🔴 **ordinal collision** |

Three things fall out of this, and all three change the design:

1. **"Top leagues have no playoffs" holds only for England, Spain and Italy.** Germany, France and
   Portugal each carry a `Final` round — the relegation play-off — inside the same league id.
   The Netherlands carries a European-qualification play-off bracket. So the playoff case is not
   deferrable to "lower leagues later"; it is present in four of the eight top leagues sampled.

2. **`parseRound()` returns `null` for every playoff round** (`"Final"`, `"Semi-finals"` have no
   trailing digit). Those fixtures import with `round_number = NULL`. That is not silent-zero
   scoring — but it is a fixture with no matchweek, so it cannot be round-keyed, cannot be opened,
   and cannot inherit a matchweek deadline. It would import and then sit inert.

3. **Belgium and Scotland reuse ordinals across phases.** ⚠ *Corrected 2026-08-14 against the live
   fixture feed — an earlier version of this line said `Regular Season - 31` collided with
   `Championship Group - 31`, which is not what the data shows.* The regular season and the
   play-off phases are numbered **consecutively**, not overlapping: Belgium's `Regular Season` runs
   1–30 and Scotland's `1st Phase` 1–33. The collision is **between the parallel groups the league
   splits into**, which run at the same time and therefore share ordinals with each other —
   Scotland has `Championship Group - 34` and `Relegation Group - 34`; Belgium has *three* phases
   all reusing 31–40. Two concurrent fixtures would land in the same matchweek. Scotland also does
   not use the string `Regular Season` at all; its phase is `1st Phase`. The design conclusion is
   unchanged — the ordinal alone cannot identify a round — but the mechanism is a parallel split,
   not an overlap with the league phase.

> **⇒ Round identity cannot be a bare integer.** It is `(phase, ordinal)`. Migration 024's
> `matches.round_number INTEGER` is necessary but not sufficient, and this is much cheaper to get
> right now than to retrofit once a season's fixtures are stored against the wrong key.

---

## 3. Design

### 3.1 Two axes — and a genuinely new pool format

> **Decided 2026-07-30 → revised 2026-08-14 by Ryan:** a league pool gets **its own
> `prediction_mode`**, not a reuse of `progressive`. Rationale: `progressive` is a World-Cup
> knockout shape — its rounds exist *because teams are unknown until the previous round resolves*.
> A league's rounds exist because a season has matchweeks. Same machinery, different reason, and
> conflating them buries the league inside a mode whose name and semantics will never fit it.

**The real cost, measured (not the grep count first quoted).** `prediction_mode` appears 355 times,
but as *dispatches* it is:

| Kind | Count |
|---|---|
| Equality comparisons — `=== 'bracket_picker'` | 49 |
| Equality comparisons — `=== 'progressive'` | 46 |
| Equality comparisons — `=== 'full_tournament'` | 6 |
| `switch`/`case` on the mode | 3 |
| Declarations of the literal union `'full_tournament' \| 'progressive' \| 'bracket_picker'` | ~40 |

Two things follow. First, ~40 places **re-declare the same union inline** instead of importing a
shared type — so widening it is a mechanical, compiler-enforced sweep, and the type checker names
every site that must make a decision. Second, almost all branching is *"is this the bracket-picker
special case"* or *"is this the progressive special case"*. A new value falling through those
guards lands on the `full_tournament` default, which is **wrong for a league** — it is the 46
`progressive` guards that switch on the round machinery a league needs.

**So the sweep is not "add a fourth value to 40 unions".** The durable version is to replace
scattered mode equality with named capability predicates:

- `usesRounds(mode)` — true for `progressive` and the league mode (round states, per-round
  submission, auto-open)
- `usesBracket(mode)` — true for `full_tournament` and `bracket_picker`
- `isBracketPicker(mode)` — the genuine special case

That collapses 97 scattered comparisons onto three named questions, makes the league mode's
behaviour a declaration rather than an accident, and makes Last Man Standing cheap when it lands.

### 3.1c The two axes, as built

Decision 9 frames the format grid as *"two axes, not a nested menu"*. Both axes are real columns:

- **`tournaments.format`** carries the **competition** shape (`groups_knockout` | `league`).
- **`pools.prediction_mode`** carries the **pool** shape — now gaining `league_pickem`.

**v1 league pool = `tournaments.format = 'league'` × `prediction_mode = 'league_pickem'`.**

### 3.1d ⚠ A refinement to R2 that survives the decision

The risk register says a league pool *"scores zero, silently"*. Reading the **live**
`shadow_score_match`, that is true for a `full_tournament` league pool — the gate falls to
`pth IS NULL → false` and the score type becomes `miss`. But the gate's second arm is
`WHEN prediction_mode = 'progressive' THEN true`, so the zero is a property of the **mode**, not
of the league.

Since `league_pickem` is a *new* value, it hits **neither** arm and lands on the `false` branch —
so a league pool would score **zero**, exactly as R2 describes, unless the gate is taught about it.
**The gate fix is therefore load-bearing under this decision**, where it would have been optional
under the `progressive`-reuse option. It is now Phase 1's first task, not a nice-to-have.

Behind the gate the price bug is unchanged and independent: `regular_season` bills at
`knockout_*` rates, and only 26 of 623 pools have those equal to `group_*`.

### 3.2 Round identity — `(phase, ordinal)`

Add to 024 (or a follow-on 045, see §4):

- `matches.round_label TEXT` — the provider's raw string, stored verbatim. Costs nothing, and it is
  the only way to debug a collision after the fact.
- `matches.round_number INTEGER` — ordinal **within the phase** (already in 024).
- Phase lives in `matches.stage`: `regular_season` for the league phase; playoff rounds map to the
  existing knockout stages when we get there.

**Importer changes:**

- Detect the regular-season phase from the feed rather than hardcoding `"Regular Season"` (Scotland
  says `1st Phase`).
- **Import only the regular-season phase in v1.** Playoff rounds are reported and skipped with a
  reason, exactly as the importer already does for unmapped teams.
- **Refuse to commit on an ordinal collision.** If two imported fixtures in one phase would take
  the same `round_number`, throw. This is the CI-assertable version of "a league pool that scores
  zero must be impossible to ship unnoticed" — applied one stage earlier, at ingest.

That makes La Liga, Serie A, Bundesliga, Ligue 1, Primeira Liga and Eredivisie **configuration, not
code**: one `tournaments` row, one import run. Belgium and Scotland import their regular season
cleanly and stop there. The Championship works for its 46 matchweeks and stops before the playoffs.

### 3.3 Scoring — one engine, no fork

The July draft asked which engine hosts league scoring and recommended SQL-only. I agree, and there
is now a cleaner way to enforce it than a policy:

- Fix the two binaries in `shadow_score_match`:
  - gate — treat `regular_season` like `group` (teams are given by the fixture, not predicted);
  - price — a **flat tier** for `regular_season`, using the `group_*` columns as the single tier.
- Make `recalculatePool` **return early for league-format pools**. The Node engine never scores a
  league, so there is nothing to hand-fork and nothing for a parity alarm to falsely bless.
- Make `readSource` return `'shadow'` for league pools **by format**, not via
  `shadow_read_enabled_pools`. That list is an allowlist: a new league pool omitted from it would
  read prod, find nothing, and render zeros. Format-driven avoids an ops footgun on every new pool.

Reusing the `group_*` columns as the flat tier keeps league pools on Decision 6's canonical
100/75/50 with no new settings columns, which also keeps them comparable across pools — a stated
Showdown prerequisite. The naming (`group_exact_score` on a competition with no groups) is a smell;
renaming to `base_*` is a sport-#3 job, not this one.

### 3.4 Matchweek locking

`trg_enforce_prediction_before_kickoff` locks each fixture at its own kickoff. In a league that lets
a Sunday picker see Saturday's results. For a league-format tournament the trigger should compare
against `MIN(match_date)` for the fixture's `(tournament_id, round_number)`. Needs an index on that
pair. Must stay DB-level — mobile writes predictions directly.

### 3.5 Auto round-opening — smaller than recorded

The programme calls this *"the single largest genuinely-new piece of work"* with *"zero code"*.
That is not what is in the tree. `lib/auto-submit.ts:439` already: completes a round, looks up the
next via `ROUND_ORDER`, checks its fixtures have teams assigned, and opens it with a deadline
defaulted to 2 h before its first fixture.

Two of those three steps are already right for a league. The third — `allTeamsAssigned` — is
trivially true for a league, where teams are real from day one. What is actually missing is that
`ROUND_ORDER` ([lib/tournament.ts:167](../lib/tournament.ts)) is a **static seven-key map of World
Cup rounds**. Replace the map lookup with a resolver that, for a league, returns matchweek *k+1*
when it exists. `pool_round_states.round_key` is already `TEXT`, so `mw_12` needs no migration.

The typed surface is the real work: `RoundKey` is a literal union derived from `ROUND_KEYS`, and
`ROUND_LABELS` / `ROUND_MATCH_STAGES` are `Record<RoundKey, …>`. Those widen to a format-aware
lookup. Sizeable, mechanical, and type-checked — the compiler finds every site.

### 3.6 Divergence at the advancement dispatch

`sync-fixtures/route.ts:270` sends every non-`group` completion to `advance-teams` as
`knockout_result`. A league fixture is `regular_season`. Read the tournament's `format` at that
point and skip advancement entirely for a league — a league has nothing to advance. This is the
July draft's finding and it stands unchanged; it must land **before** 024 is applied.

On **R16** (`advance-teams` reading `matches`/`teams`/`match_conduct` unscoped): worth a
recalibration. Its stated trigger is a second competition being ingested. But once §3.6 lands, a
league fixture never reaches `advance-teams` at all, and the World Cup is complete, so no World Cup
match will newly complete and fire the cascade either. **My read: R16 stops being a blocker for the
league path specifically** — it remains owed to the next *cup* competition, and the `match_conduct`
1,000-row cap remains real for the audit scripts. I would scope it because it is cheap, not because
it gates this. Flagging because it is a downgrade of a registered blocker and should be Ryan's call,
not mine.

---

## 4. Phases

Ordering is a dependency order, not a schedule.

**Phase 0 — make the door safe, then open it**

| # | Step | State |
|---|---|---|
| 1 | Advancement dispatch diverged — `lib/competitionFormat.ts`, wired into `sync-fixtures`. Keyed on **`stage`**, not `tournaments.format`, so it needs no 024 column and is safe to deploy before the migration. Inverted to fail-closed: only known bracket stages advance. | ✅ done |
| 2 | Multi-tenant sync — `lib/integrations/apiFootball/syncTargets.ts`; the cron loops over competitions. Falls back to the env single-target if 024's columns are absent, with an explicit error check, so **deploy order is not load-bearing in either direction**. | ✅ done |
| 3 | Migration **045** — `matches.round_label`, `(tournament_id, round_number)` index, matchweek-level lock, `league_pickem` CHECK widening. Opens with a `DO` block that **raises** if 024 is not applied. | ✅ written, not applied |
| 4 | Apply **024**, then **045**, to production | ✅ applied 2026-08-14 |
| 5 | Deploy the code | ✅ deployed 2026-08-15 01:08 UTC |

**Deploy verified, not assumed.** `master` `55acc2f` → production `dpl_4jokuDR4XVetZxCSHQNKHuAX7SAV`,
aliased to sportpool.io, build 52 s. Confirmed live by a behaviour change rather than by the
dashboard: the sync cron's quiet-run note used to read `"no live window matches"` (an early return
this refactor removed) and now records `null`. The last old-code run was **01:09:00**, the first
new-code run **01:10:00**.

That single field also proves the multi-tenant path is real: `loadSyncTargets` emits an
`env fallback in use` note whenever it cannot read the ingest config off the `tournaments` row. No
run has emitted it, so the cron is reading `external_league_id` / `external_season` / `format` from
the row — competition config now lives in data, not in env vars. Zero errors, ~0.4 s per run.

**Post-apply verification, 2026-08-14 (production):**

- `tournaments`: World Cup row backfilled to `format='groups_knockout'`, `external_league_id=1`,
  `external_season=2026`, `external_provider='api_football'`. The sync cron can now read its config
  from the row.
- CHECKs widened: `matches_stage_check` accepts `regular_season`; `tournaments_tournament_type_check`
  accepts `premier_league`/`league`; `pools_prediction_mode_check` accepts `league_pickem`.
- `matches.round_label` present; `idx_matches_tournament_round` present; **0** `regular_season` rows,
  so the trigger's league branch is unreachable and the World Cup path is provably unchanged.
- **The replaced trigger was exercised against live data**, not just inspected: a no-op self-update
  of a real prediction on a completed match was targeted (1 row) and blocked by the trigger
  (0 rows passed). No data changed.
- **The new matchweek-deadline expression was validated** against a synthetic matchweek
  (Sat 12:30 / Sat 15:00 / Sun 14:00 / Mon 20:00): all four fixtures resolve to Saturday 12:30, the
  next matchweek is not dragged in, a second competition sharing ordinal 3 does not leak in, and a
  cup fixture with a NULL ordinal keeps its own kickoff.

⚠ **What is NOT yet proven:** the trigger's *allow* path and the league branch end-to-end. All 104
World Cup fixtures are completed, so production currently contains no fixture a prediction could
legitimately be written against. Both get their real test at Phase 3, when a season is imported —
and that test is a launch gate, not a nicety.

Two things found while doing this, both fixed, neither in the original plan:

- **The pool sweep read `pools` unpaginated.** At 623 pools it is under the PostgREST 1,000-row cap;
  a second competition's pools cross it, and the pools past the cap would simply stop being
  recalculated with no error anywhere. Now paged (`fetchPoolsForSweep`).
- **045's trigger would have been a silent time bomb if applied before 024.** PL/pgSQL resolves
  column references at runtime, so it compiles fine and then throws on *every* prediction write,
  web and mobile. Hence the guard in step 3 rather than a comment.

⚠ **Ordering constraint for step 4→5:** 024 and 045 are safe to apply **before** the code deploys
(both are additive; the trigger's league branch is unreachable with no `regular_season` rows).
The reverse is also safe, by construction — see step 2. What is **not** safe is applying 045 without
024, which the guard now prevents.

### ⚠ Phase 1 found a live landmine in shadow — and tripped it

**Summary: shadow's price lookup had been wrong since migration 042, invisibly. Re-scoring 7 World
Cup matches to verify my change made it visible, and left 157 rows across 6 pools / 63 entries
+4,884 points above what the Node engine holds. That drift is real and is currently in production.**

**What was already broken (not caused by this work).** Migration 042 removed `knockout_*` as a
*second, parallel base* in the Node engine and folded the group→knockout ratio into the stage
multipliers, so `core.ts` reads `group_exact_score` for every stage. **Shadow was never updated.**
It still read `knockout_*` as a base *and* applied the folded multiplier — double-counting the ratio.

This was undetectable by every check in place:

- The stored `shadow_match_scores` rows were written *before* 042 changed the multipliers, so they
  held pre-042 values that were correct and **agreed with `match_scores` exactly**.
- The parity alarm compares totals, and the totals agreed. It could not see that the *function*, if
  ever re-run, would produce something different.
- Nothing had re-scored a completed World Cup knockout match since 042.

So it was armed, not firing. **Any** reconciler, sweep, or manual rescore touching a knockout match
would have inflated those members' points — shadow is the read source for all 623 pools.

**What I did.** Re-scoring 7 matches (one per stage) as a no-regression check produced
`sum(total_points)` 12,833,270 → 14,403,710. `base_points`, `pso_points`, every `score_type` count
and `teams_match` were **identical**, which isolated it to the multiplier — something 046 did not
touch. Comparing against `match_scores` confirmed the direction: the 269,359 rows never re-scored
still agreed with Node, while the 17,513 I re-scored had jumped.

**Fix — migration 046d.** Shadow now uses one base for every stage, exactly as `core.ts` does. This
is also what gives a league fixture its flat tier for free (base × multiplier 1), so the 042
alignment and the league requirement turn out to be the same change. `stage_uses_base_prices` was
dropped: there is no longer a per-stage pricing distinction for it to express.

**State of production now:**

| | rows | disagree with Node | net points |
|---|---|---|---|
| Never re-scored (97 matches) | 269,359 | 16 | +1,650 (pre-existing, untouched) |
| Re-scored by me (7 matches) | 17,513 | 157 | **+4,884 (new)** |

Total `sum(total_points)` is 12,835,454 against an original 12,833,270 — **+2,184 across 286,872
rows**, i.e. 042's fold reproduces the old totals almost exactly. The residual sits in ~6 pools with
fractional multipliers (0.08, 1.75, 2.63, 5.25, 16.00) — 042's own note records *"sixteen pools whose
ratio differed per tier and could not be preserved exactly"*. One multiplier cannot preserve exact,
GD and winner when their base ratios differ, so those pools cannot be made to agree by any formula.

⚠ **A second, larger finding:** `match_scores` has not been re-scored since 042 either. Both tables
hold pre-042 numbers. Neither engine's *stored* values match what its own *current code* would
compute. The two agreeing with each other proves only that they are stale in the same way — which is
the *parity is not an oracle* lesson arriving a second time, from a new direction.

⏳ **NEEDS RYAN — do not resolve this by default.** Shadow is now half re-scored: 7 matches on the
post-042 formula, 97 on the pre-042 stored values. Three options, none obviously right:
  1. **Re-score all 104** — shadow becomes internally consistent and formula-correct, at the cost of
     moving ~2,184 points across completed pools and widening the shadow↔Node gap until Node is also
     re-scored.
  2. **Leave it** — 157 rows in 6 pools stay +4,884. Smallest footprint, but shadow is internally
     inconsistent and the next sweep to touch any knockout match resumes the drift anyway.
  3. **Re-score both engines** — the only end state where stored values match current code. Largest
     blast radius, and it is a points change to finished pools that members can see.

The World Cup is complete and its pools are effectively archived, which is what makes this a
judgement call rather than an emergency.

**Phase 1 — league scoring** — ✅ complete 2026-08-14

| # | Step | State |
|---|---|---|
| 5 | Gate + pricing. Three "group vs everything else" binaries replaced with named predicates (`stage_has_scheduled_teams`, `mode_submits_per_round`). Found a **third** zero-scoring path not in the register: the submission filter names only `progressive`, so a league pool's entries were filtered out before scoring ran. | ✅ 046a–c |
| 5b | ⚠ **Unplanned** — single-base pricing, aligning shadow with migration 042. See the landmine section above. | ✅ 046d |
| 6 | `recalculatePool` early-returns for `league_pickem`; `getScoringSource` returns `'shadow'` by **mode**, not via the allowlist (an omitted pool would have read prod and rendered zeros). Locked with tests. | ✅ code |
| 7 | Bonus path **proven** inert for a league, not assumed: every source CTE is gated on `stage='group'` or on `shadow_resolved_*` / `shadow_actual_*` tables a league never populates, and the retraction `DELETE` is entry-scoped. Its submission filter aligned anyway — it stops being a no-op when Final Table lands. | ✅ 046e |

Remaining `= 'progressive'` literals in `shadow_score_match` (3) are deliberate: they express
bracket-resolution semantics (progressive resolves teams from the actual bracket), not submission.

**Phase 2 — matchweeks as rounds** — ✅ complete 2026-08-14

| # | Step | State |
|---|---|---|
| 8 | Format-aware round model: `lib/competitionRounds.ts` (pure, 23 tests) + `lib/roundMatches.ts` (the one query helper). A round now carries a **selector** — "these stages" or "this matchweek" — instead of a stage list. | ✅ |
| 8b | Every league-facing server path converted: the auto-complete/auto-open sweep, the rounds list, round open/close, and round submission. | ✅ |
| 9 | `lib/poolRoundStates.ts` seeds rounds from the competition, shared by both pool-creation routes (the seven-key World Cup list was a literal in each). 7 tests. | ✅ |

**The bug this phase actually removes.** `ROUND_MATCH_STAGES[key] ?? []` appears at roughly a dozen
call sites. A matchweek key is not in that map, so it coalesces to `[]`, and `.in('stage', [])` is
not an error — it is a valid query returning zero rows. Every one of those sites would have read
that as *"this round has no fixtures yet"* and done nothing:

- the auto-complete sweep would have seen *all zero* fixtures finished and **completed matchweek 1
  immediately**, then cascaded through the whole season in one pass;
- submitting a matchweek would have saved **zero predictions and reported success**;
- the rounds list would have shown every matchweek as `0 matches`.

Same silent-emptiness class as the zero-scoring pool. The selector makes an unknown key return an
**error** rather than an empty round.

**Three decisions worth recording:**

1. **League deadlines are the matchweek's first kickoff exactly**, with no grace window — bracket
   rounds keep their 2 h. This is not a preference: `trg_enforce_prediction_before_kickoff`
   (migration 045) enforces that instant in the database and silently drops later writes. A
   deadline that disagreed would either close a matchweek early or show an open round whose saves
   vanish without an error. (This answers §6 question 4.)
2. **Mid-season creation is handled at seed time.** Decision 2 allows joining after first lock, so
   matchweeks already kicked off seed `completed`, the next upcoming one seeds `open`, the rest
   `locked`. Seeding all `locked` would leave a September pool with nothing open and nothing able to
   open it — the sweep only advances a round when the previous one completes.
3. **Round succession is resolved against the pool's real rows**, not a static map. There is no
   constant that is right for a 34-, 38- and 46-matchweek league at once, and it steps over a gap in
   the feed rather than dead-ending on it.

**Found and fixed in passing:** the deadline auto-submit sweep re-queried the round's fixtures
**once per entry**. For a 38-matchweek league that is one fixture query per member per matchweek.
Now fetched once per round.

⚠ **Not converted, deliberately:** the bracket-only paths (`advance-teams`, `bracketResolver`) and
the progressive React flow (`ProgressivePredictionsFlow`). A league pool never reaches the first two;
the UI is Phase 4.

**Phase 3 — ingestion, generalized** — code ✅ complete 2026-08-14; the real import is blocked

| # | Step | State |
|---|---|---|
| 10 | Importer generalized: `detectRegularSeasonPhase` picks the league phase **by size**, play-off phases are skipped with a per-phase reason, an ordinal collision inside the chosen phase **throws before any insert**, and `round_label` is carried through. The script prints the phase decision and everything skipped. 17 tests. | ✅ |
| 11 | Import one real league end to end | ✅ **done 2026-08-15** — Premier League 2026/27 |

**The import.** `tournaments` row `b1299174-d459-420d-ba0e-b6397186b935` — Premier League 2026/27,
`format='league'`, `tournament_type='league'` (generic, so a second league needs no CHECK change),
api-football league 39 / season 2026. Then `scripts/import-league-season.ts … --apply`.

Season 2026 was a genuine **pre-season** import — 0 of 380 fixtures finished — which is exactly what
the importer is designed for. First fixture 21 Aug 19:00 UTC, Arsenal v Coventry.

Verified after the write:

| Check | Result |
|---|---|
| Teams / fixtures | 20 / 380 |
| Matchweeks | 1–38, **exactly 10 fixtures each** |
| A club appearing twice in one matchweek | none |
| Duplicate pairings (double round-robin) | none |
| `round_label` / `home_team_id` / `external_match_id` missing | 0 / 0 / 0 |
| World Cup rows touched | none — still 48 teams, 104 matches, 104 completed |

**Two things this proved that nothing before could:**

1. **The multi-tenant sync works end to end.** The next cron run recorded
   `notes = "synced 2 competitions"`, zero errors. Competition config is genuinely being read from
   the `tournaments` row.
2. **The matchweek lock is right on real fixtures.** Matchweek 1 runs Fri 21 Aug 19:00 → Mon 24 Aug
   19:00 — a **72-hour window** — and the trigger's deadline is the Friday kickoff. A Sunday picker
   is locked out, which is the whole reason per-fixture locking was wrong.

⚠ **The import armed a live footgun, now closed in code.** Both create-pool wizards listed
tournaments unfiltered while offering only the three World Cup modes, so a `full_tournament`
Premier League pool became creatable the moment the row existed — and it would score **zero for
every fixture, silently** (R2 exactly). Both wizards now filter to bracket-format competitions
(`format is null or 'groups_knockout'`); league competitions reappear when the league mode has a
create flow and a prediction UI in Phase 4. **This fix is committed but NOT deployed** — the
exposure is live until it is.

**Phase chosen by size, not by name.** An allowlist of known names would have imported *nothing* for
Scotland, whose phase is `1st Phase`. The league phase is always the long one — 30–46 rounds against
a handful for any play-off group — with ties broken on the earliest fixture.

**Validated against the live feed, 2026-08-14** (six leagues, real fixtures, no writes):

| League | Phase chosen | Kept / total | Matchweeks | Collisions |
|---|---|---|---|---|
| Premier League | `Regular Season` | 380 / 380 | 38 | none |
| Bundesliga | `Regular Season` | 306 / 308 | 34 | none |
| Eredivisie | `Regular Season` | 306 / 309 | 34 | none |
| Championship | `Regular Season` | 552 / 558 | 46 | none |
| Jupiler Pro League | `Regular Season` | 240 / 321 | 30 | none |
| Premiership (SCO) | **`1st Phase`** | 198 / 234 | 33 | none |

Every kept count equals the round-robin the club count implies. (Scotland's 198 is 33 rounds × 6
fixtures — a *triple* round-robin for 12 clubs, not the double the first check assumed.)

🔒 **Why the real import cannot happen yet.** The importer numbers a fresh tournament's fixtures
**from 1**, and the World Cup's placeholder-carrying matches reference source matches **73–102**.
The advancement-dispatch fix that makes this safe is committed but **not deployed**. Importing a
live season now means league fixture #73 completing, being announced to the bracket engine as a
knockout result by the deployed (old) code, and cascading a club into the finished World Cup
bracket. This is the ordering constraint Phase 0 was built around, and it holds:

> **deploy first, then create the `tournaments` row, then import.**

**Phase 4 — surfaces**
12. Create-pool wizard: filter tournaments by format and offer the league correctly (both wizards
    currently list tournaments unfiltered — `CreatePoolModal.tsx:107`, `mobile/app/create-pool.tsx:144`).
13. Fixture/matchweek UI on web and mobile; `app/competitions.ts` status flipped off "Coming soon".

**Not in this plan:** Results depth (needs its own `predicted_outcome` migration first), Showdown,
Last Man Standing, Final Table, promotion playoffs.

---

## 5. Verification — the standard this has to meet

There is no sibling implementation to compare against, and per the parity lesson that is a feature.
Validate against the domain:

1. One real completed matchweek, one real member: hand-compute their points from the fixtures and
   their picks; compare to what the engine stored **and** to what their screen renders.
2. CI assertion on a seeded league fixture set: **non-zero scoring**, and **prices equal to the flat
   tier** — the second is the bug that survives the first.
3. CI assertion that an ordinal collision in an import plan throws.

---

## 6. Decisions needed from Ryan

1. **`progressive` as the league pool shape** (§3.1) — this is the load-bearing call. It avoids a
   fourth `prediction_mode` and 355 branch sites, and it means the gate bug is already bypassed.
   Confirm, or say why a league wants its own mode.
2. **Scope: main European leagues.** Given §2, I propose v1 = **regular season only, any league**,
   which covers England/Spain/Italy completely and Germany/France/Portugal/Netherlands for their
   34 matchweeks, stopping before their playoff tail. Alternative is Big-Five-only with the playoff
   leagues held back entirely.
3. **Flat tier = the `group_*` columns**, reusing canonical 100/75/50 (§3.3). Or a new
   `league_*` set of settings columns.
4. **Matchweek deadline: first kickoff, or 2 h before it?** The existing auto-open defaults to
   2 h before; the July draft said first kickoff. Both are defensible; they must agree with the
   trigger in §3.4.
5. **R16 downgrade** (§3.6) — accept that it no longer gates the league path?
6. **The date.** Phases 0–3 are the minimum for a league pool that scores correctly. This is not a
   two-week body of work, and the EPL season has already started (2026-08-14). Decision 2 already
   blessed joining a league pool mid-season — *"week 3 of 38 is viable"* — so a September open on
   solid foundations remains the better trade than compressing scoring.
