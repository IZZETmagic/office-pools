# League Pools — the full implementation plan

> **Written 2026-08-24.** A sub-plan of `SPORTPOOL_PROGRAMME.md`, covering **league
> pools as a product line**: Premier League first, then La Liga, Bundesliga, Serie A,
> Ligue 1.
>
> **Scope boundary, stated once and binding throughout:** *nothing in this plan touches
> the World Cup.* No `shadow_*` function, no `matches`/`teams`/`predictions` row, no
> World Cup scoring path is modified. Where a league needs a behaviour the World Cup
> already has, the league gets **its own** copy over `league_*` tables. That is Ryan's
> 2026-08-15 split and this plan is written inside it.
>
> Supersedes L4→L13 of `2026-08-22_premier_league_backend_design_v3_1.md` and continues
> from `2026-08-22_league_vertical_slice.md`, which is delivered.
>
> **⚠ AMENDED the same evening — read §0 before anything else.** Ryan reviewed the member
> journeys and returned eleven changes. Two of them overturn recorded decisions, one
> overturns a recommendation made earlier in this very document, and several reorder the
> phases. Where §1–§7 below disagree with §0, **§0 wins.**

---

## 0 · Amendment — Ryan's eleven changes, 2026-08-24 evening

Companion artifact (the plain-English version Ryan actually reads):
*A Season in a League Pool*, revision 2.

### 0.1 Mode structure is now two levels, and Table is a mode

**Level 1 — what kind of pool:** `pickem` · `showdown` · `last_man_standing` · `table`.
**Level 2 — depth, asked only for Pick'em and Showdown:** `results` · `scores`.

Last Man Standing and Table have **no depth axis**. Showdown **does** carry its own depth
and scores differently at each — it is still a layer over the weekly accuracy number, but
the admin chooses that number's shape when they create the pool.

Storage consequence: `pools.league_mode` (level 1) **and** `pools.league_depth` (level 2,
NULL for LMS and Table), both locked at creation by trigger. The plan previously assumed a
single `league_depth` column and Full Table as a boolean add-on — that is now wrong.

### 0.2 🔴 OVERTURNS Decision 9 — Full Table is a standalone mode, not an add-on

Decision 9 says *"Final Table is an add-on, not a mode"*, reasoning that *"done for the
season in August leaves nothing to say to each other on a Tuesday in November."*

**Ryan overturns this with cause**, and the cause answers the original objection directly:
the mode is aimed at **people new to football** who want one quick decision they can come
back and check, and the return-reason is the **live league table plus notifications**, not
a weekly input. Recorded as an overturn, not a divergence, per `CLAUDE.md`.

The `full_table` / `headline_only` profile split from §3.1 **survives unchanged** — it is
now two profiles of a mode rather than two profiles of an add-on.

### 0.3 🔴 OVERTURNS §3.5 of this document — the table comes from the feed, not from us

> ✅ **EXTENDED 2026-08-24, migration 089 — the BANDS come from the feed too.**
> `table_top_n` / `table_relegation_n` defaulted to **4 and 3**, and nothing ever
> wrote a settings row, so every pool in every competition was scored against
> England's shape. Correct for the Premier League and for La Liga by luck;
> silently wrong for a twelve-club league (a "top four" bonus covering a third of
> the table) and for one that relegates one club or none.
>
> `league_default_bands()` counts the feed's own `description` — the column the
> Table tab already shades its stripes from, so the two can no longer disagree.
> Live Premier League derives `{top_n: 4, relegation_n: 3, source: "feed"}`:
> the same numbers, now read rather than assumed. Falls back to the frozen
> snapshot once the season ends (`feed_final`), and to 20%/15% of the club count
> when the feed says nothing at all — reported as `source: "proportional"` so a
> guessed band is visible rather than silent. An explicit pool setting still wins.
>
> 🔴 **Migration 090 — the matcher met seven other leagues and was wrong for two.**
> Live `/standings` pulled for eight competitions on 2026-08-24. The Scottish
> Premiership tags its post-split bottom half `"Premiership (Relegation Group)"`
> — **six clubs of twelve** — so counting `%relegation%` would have paid a
> relegation bonus for half the league, every season, silently. MLS describes
> only play-off bands, so it derived no top band at all.
>
> Fixed: a description containing *"group"* is a split, not relegation, and its
> presence marks the band `unclear` rather than asserting zero; a band larger
> than a quarter of the league is refused whatever it calls itself; and zero
> stays zero when a described table genuinely never mentions relegation, because
> MLS has none. Each band now carries **its own source** — Scotland's top is
> extrapolated while its relegation is refused, and one word for both would hide
> that. Proven against all eight, verbatim, by `scripts/verify-league-bands.ts`:
>
> | | top | down | |
> |---|---|---|---|
> | ENG · ESP · ITA | 4 | 3 | feed |
> | GER | 4 | 3 | 2 automatic + 1 playoff |
> | FRA | 3 | 3 | rank 4 reads `" Qualifying"`, not guessed at |
> | NED | 2 | 3 | one direct CL place, one qualifier |
> | SCO | 2 | 2 | both extrapolated — the feed describes a split |
> | USA | 6 | **0** | no relegation, and that is the right answer |
>
> ✅ **Migration 091 — the bands now FREEZE with the table.** `league_standings_final`
> captured rank, points, goal difference and games played, and **not
> `description`** — so the ranks were frozen and the bands were not. A table
> re-tagged in June (an extra Champions League place on coefficient, a cup winner
> shifting the Europa places) would have moved the band and repriced an award
> already announced. Ryan named the mechanism before the code did. The snapshot
> now carries the labels, and `league_default_bands` reads the frozen ones once
> they exist.
>
> **On refresh cadence — the instinct was right, the answer is that it is already
> better.** The standings are re-read on **every tick where a fixture completed**,
> because the table cannot move for any other reason. Monthly polling would be a
> downgrade *and* would spend the api-football allowance re-reading an unchanged
> number. What was missing was never more frequent reading; it was **stopping**.
>
> ### Per-band readability — measured, not assumed
>
> | | ENG | ESP | GER | ITA | FRA | NED | SCO | USA |
> |---|---|---|---|---|---|---|---|---|
> | Champions League | 4 | 4 | 4 | 4 | 3 | 2 | — | — |
> | Europa League | 1 | 1 | 2 | 1 | 1 | 1 | — | — |
> | **Conference** | 0 | **0** | 1 | **0** | **0** | 4 | — | — |
> | Relegation | 3 | 3 | 3 | 3 | 3 | 3 | — | — |
>
> **Champions League and Europa are readable; Conference is not.** Spain calls it
> `"ECL Playoffs"`, Italy and France just say `"Play-offs"` with no competition
> named, and France's fourth Champions League place reads `" Qualifying"` —
> leading space, nothing else. Adding Europa as a scoring band is safe; adding
> Conference would silently pay nothing in three of the five leagues that have
> one. **Both are new bonus bands and therefore a product call, not a bug fix** —
> decision 10 settled the Table slice at champion / top-N / relegation / perfect,
> and two more bands change its size.
>
> ✅ **EUROPA ADDED 2026-08-24 — migrations 092 + 093.** Ryan's call. **50 a club,
> order-free** — half the top band, because fifth is worth less than fourth and
> the scoring should say so. A perfect Premier League table goes from 3,500 to
> **3,550**; ~1.4% of the slice, so decision 10's 12-15% sizing is unchanged.
>
> ⚠ **The band is a pair of RANK BOUNDS, not a count.** Europa does not start at
> rank 1, and `top_n + 1` would be **wrong for Ligue 1**, where an unnamed
> `" Qualifying"` sits at rank 4 between the Champions League places and Europa.
> Bounds read straight from the feed give ENG/ESP/ITA/FRA 5-5, GER 5-6, NED 3-3,
> and NULL for Scotland and MLS. Never extrapolated: a league without European
> places should not pay for them, and no ratio could tell us otherwise.
>
> **Conference is still NOT built**, and the reason is recorded above: three of
> the five leagues that have one do not name it.

§3.5 says the actual table is DERIVED from completed fixtures, the `lib/podium.ts` trick.
**That is wrong and must not be built.** A derived table cannot see **points deductions**
(Everton −10 then −8, Forest −4, all 2023/24). It would misrank clubs against the table on
television for a whole season — and Table mode *scores against* it, so every member's bonus
would be wrong.

**api-football exposes a `/standings` endpoint we have never used.** Our client
(`lib/integrations/apiFootball/client.ts`) implements only `/fixtures`, `/fixtures/events`
and `/teams`. Standings returns per club: `rank`, `points`, `goalsDiff`,
`all.played/win/draw/lose`, `form`, `description` (names the Champions League and
relegation bands) and `status` (`same` / `up` / `down` — **the movement arrows, for free**).

- **Source of truth for display and for scoring: the feed.**
- `league_actual_table()` is demoted from source-of-truth to a **cross-check** that raises
  if the two disagree — which is also how a deduction gets noticed.
- New ingestion needs the `hasEnvelopeErrors` guard: api-football returns refusals as
  **HTTP 200 with a populated `errors` object**.
- A season-end **snapshot** of the final standings is required before Table mode pays out,
  so scoring never depends on a live third-party read.

This also settles decision 13 differently: **head-to-head is no longer our problem** — the
feed's `rank` already applies the real tiebreakers. `league_actual_table()` keeps `name ASC`
because it is only a cross-check now.

### 0.4 Scoring goes live *during* a match, not at full time

> ✅ **SHIPPED 2026-08-24, migration 063 — with one correction to this section.**
> *"Change the call-site condition, not the engine"* was **wrong**: the engine refused a
> live fixture on its own (`IF NOT v_completed ... 'fixture not completed'`), so opening
> only the call site would have produced a sync arm calling an engine that declined, with
> `ok:false` swallowed as "the next tick will get it" — silent, and indistinguishable from
> working. Flagged and approved rather than diverged from quietly. The rest of the section
> held: the scoring maths is untouched and the engine was already idempotent.
> Verified goal by goal: 0 → 75 → 100 → 0 → 100 across one match
> (`scripts/verify-league-live-scoring.ts`).

Today `syncLeagueFixtures.ts` calls `league_score_fixture` **only when `c.is_completed`**,
so a league leaderboard moves once, at the whistle. Ryan wants it to move as goals go in —
an exact prediction that becomes a near-miss should visibly cost the member their place
while the game is still on.

Change: score on **every observed score change**, not only on completion.
`league_score_fixture` is already idempotent and already takes points back on correction,
so this is a call-site condition, not an engine change.

**Cost note, from `project_scalable_architecture`:** all scoring together was ~1.3% of DB
time; reads (70.3%) and realtime (25.6%) are the expense. Re-scoring a fixture five times
instead of once is negligible. **The work is the delivery** — pushed updates, not polling —
and with two league pools live this is the cheapest moment it will ever be to build.

### 0.5 The Form tab is deferred, and is deliberately NOT live

Ryan: not launch-critical, may stay blank. When built, it updates **after a match
completes**, never during. Keeps the live path narrow: leaderboard = live scoreboard, Form
tab = report card. **L-B's five `readSource` league arms move out of the launch spine.**

### 0.6 Matchweeks open and close automatically — admins have no lever

Strict. No admin open/close button; the only re-open is a super-admin repair for when we
have broken something, requiring a reason. Contradicts the World Cup's per-pool progressive
round-open playbook **by design** — 38 matchweeks over ten months cannot depend on an admin
remembering.

**Schema gap:** `league_matchweeks` has `lock_at` but **no concept of "open"**. Needs an
opens-at rule plus the state. Decided: **matchweek N opens the moment matchweek N−1 locks,
and only one matchweek is open at a time** — a member cannot work ahead.
⚠ Cost accepted knowingly: someone away a fortnight scores zero for two weeks. Mitigation
if it bites — "pick ahead" is a display rule, not a data rule, so it can be added later
without rework.

Notifications required at launch, **email and push**: matchweek opened · lock reminder (only
to those who have not picked) · results are in. The unused
`league_matchweeks.open_notified_at` / `.lock_reminder_sent_at` columns are exactly for this.

### 0.7 🔴 Soft deletion everywhere — nothing is ever erased

Currently **all three doors permanently destroy a member's whole season**:
`leave/route.ts` deletes `pool_members`, `stop-participating/route.ts` deletes
`pool_entries`, and everything cascades — `league_predictions`, `league_entry_totals`,
`league_match_scores`, and the World Cup's `predictions` too.

New behaviour, **all three doors**: retain every prediction, flag the entry as not scored,
drop it from leaderboards and Showdown pairings. **Re-adding restores the full history** —
retained predictions reconnect and are re-scored, *including the matchweeks that happened
while they were away*, so the member is made whole rather than partially whole.

⚠ **This is shared plumbing — it touches all 623 World Cup pools**, which is precisely why
Ryan wants it: the World Cup produced real complaints about accidental removals that could
not be undone. It is therefore an exception to the scope boundary at the top of this
document, taken deliberately, and it is **the one item that should not be deferred.**

### 0.8 Web first; mobile after the tables are settled

Confirms L-G stays deferred. Everything below is web unless stated.

### 0.9 Reuse the World Cup wizard and the post-lock reveal

> ✅ **SHIPPED 2026-08-24.**
>
> **The wizard** now offers a league's own two modes — Matchweek Pick'em and
> Predict the Table — and, for Pick'em, the depth (*Pick a winner* / *Predict the
> score*). Showdown and Last Man Standing are deliberately absent: they are not
> built, and an option a member can see is a promise. The route validates the
> mode against the same list as the CHECK, and the stale comment claiming
> "leagues are OFF the wizard" and "cannot score" is gone — both were false.
>
> **The reveal** is a new `league_pickem` branch in `computeReveal`, keyed on
> each matchweek's own `lock_at`. It is NOT the progressive branch: a league
> matchweek that has not *opened* yet is also derived as state `'locked'` (that
> is what the word means in the World Cup round vocabulary), so reusing it would
> have called a matchweek in April revealable in August. Both call sites — the
> bulk route and the per-entry route — now read `league_matchweeks` and
> `league_predictions` rather than `pool_round_states` and `predictions`, which
> a league pool does not use. Results-depth taps go through the *same* gate.
> Verified end to end by `scripts/verify-weekly-reveal.ts`.
>
> 🐛 **Found and fixed on the way:** `ResultsTab` gated everything on
> `pool_entries.has_submitted_predictions`, which a league entry can never carry
> — the league write path is forbidden from touching that column. Every league
> entry therefore rendered an empty Results screen, *including the member's own*.
> Now derived from the picks, as `deriveRoundSubmissions` already does.
>
> ✅ **Results-depth display — DONE, same day.** `ResultMatch` gained
> `predicted_outcome` **beside** `prediction`, never inside it: Decision 9
> forbids encoding home/draw/away as 1-0 / 0-0 / 0-1, because a sentinel
> scoreline scores as a genuine exact and shows a member a prediction they never
> made. Both `MatchCard` and `MatchTableRow` now treat a tap as a prediction and
> render it by CLUB — *"Arsenal win"*, *"Draw"* — which is how a person says it.
> The taps reach the screen through the same reveal gate call as scorelines, so
> there is no second copy of the rule to drift.
>
> Also fixed while there: the round filter offered six World Cup rounds that
> matched nothing in a league, because every league fixture is `regular_season`.
> It now hides itself when the fixture list has only one stage — true for a
> league, never for the World Cup, whose full schedule is seeded up front.

The guided prediction wizard and *"see everyone's picks after lock"* both got strong
feedback. The league needs its own version of each. The league version is **stronger**: the
reveal fires **every matchweek** rather than once a tournament.
See `memory/project_feature_member_predictions_visibility.md`.

### 0.10 "Simple vs Advanced" is the ADMIN's config surface — no naming conflict

Resolved: it is not about player input depth. **Simple** = accept our defaults, one
read-only screen. **Advanced** = edit what each outcome is worth and switch individual
bonuses on/off (the appetite the World Cup's penalty-shootout toggle served).

This sits cleanly beside Decision 6 (*"advanced means a different game, not different
numbers"* — an Advanced admin switches mechanics on) and does **not** collide with Decision
9's *"named Results and Scores, never Basic/Advanced"*, because the depths keep their names.
Maps directly to the existing **Custom scoring** row of the pricing ladder.

### 0.11 Tier placement

Free = **Pick'em + Table** (the two ways in: the football person and the office person).
Paid = Showdown, Last Man Standing, Advanced scoring, and the member cap.
Live leaderboard, live league table, notifications, banter, XP, badges and the Form tab are
**free at every tier**.

⚠ **Flag for the pricing work:** nearly everything in these eleven changes lands on the
free side. The paid tiers are left carrying the member cap, two modes and Advanced scoring.
Re-cost `drafts/2026-08-23_pricing_strategy.md` before anything goes on sale.

### 0.12 Revised order

**Status column updated 2026-08-24 (evening), verified against production.**

| # | Phase | Days | State |
|---|---|---|---|
| 1 | L-A — make the live pool work | 0.5 | ✅ **DONE** — season link, un-archived, stale round-states cleared |
| 2 | **L-M — soft deletion (shared plumbing)** | 1–2 | ✅ **DONE** — migrations 056 + 057, all four doors, round-trip verified |
| 3 | **L-N — matchweek rhythm: auto open/close** | 1 | ✅ **DONE** — 1 open (was 37), and migration 058 enforces it in the database |
| 4 | L-B′ — live leaderboard: ranks, movement, **in-match scoring**, pushed updates | 4–5 | ✅ **DONE** — migrations 059–063 |
| 5 | L-C — Results depth | 2–3 | ✅ **DONE** — migrations 064–066 |
| 6 | L-F — notifications, email + push | 3–4 | ✅ **DONE** — migrations 071–074 + the sending half |
| 7 | **L-D′ — live league table from `/standings`** | 2–3 | ✅ **DONE** — migrations 075–076 + the Table tab |
| 8 | L-E′ — Table **mode** | 3–4 | ✅ **DONE** — migrations 077–082 + the picking screen, the comparison view and the season-end snapshot |
| 9 | **L-O — wizard + weekly reveal** | 2–3 | ✅ **DONE** — the wizard offers both league modes and the depth; the reveal fires per matchweek |
| 10 | **L-J Showdown** ✅ · **L-K LMS** ✅ · Form tab · L-G mobile · L-I second league | — | 🟡 All four MODES built; Form tab, mobile and league #2 open |

**Steps 1–6 ≈ 12–15 days** ⇒ Pick'em is a real product with a rhythm and a live table.
**Steps 7–8 ≈ 5–7 more** ⇒ the newcomer audience is served.

**Steps 1–9 are COMPLETE (~23 days).** Pick'em is a real product with a rhythm: one
matchweek open at a time, both depths, live scoring, ranks and arrows, and the three
notifications. Steps 7–8 (≈5–7 days) serve the newcomer audience.

---

## 1 · What is actually built — re-verified against production, 2026-08-24 evening

Everything here was counted in the live database or read in the source this evening. Where
an earlier version of this section was wrong, it is corrected in place rather than deleted.

### The one-sentence answer

**The machinery is built; the game has never been played.** `league_predictions` holds
**0 rows database-wide** — not one pick has ever been made through the interface — so every
claim about scoring, totals and the leaderboard is verified by script against scratch data
and by *nothing else*.

### Are we on the backend or the front end?

Both, but the split is lopsided and deliberate, and it follows Ryan's 2026-08-15 decision:
*"the front end designs will stay as much as it is today as possible except it will point to
the new data."*

- **There is no separate league front end, on purpose.** `PoolDetail.tsx` contains one
  league-related comment and no league branch. The league reuses the World Cup's components
  wholesale.
- **The "front-end work" so far has been the adapter**, `lib/league/read.ts`, which shapes
  `league_*` rows into the four types those components already consume
  (`Team`, `Match`, `PoolRoundState`, `Prediction`). Plus one server branch,
  `app/pools/[pool_id]/page.tsx:139`.
- **A user can already create and open a Premier League pool in the web UI** — that is how
  both existing pools came to exist. `CreatePoolModal` includes `format.eq.league`.
  `app/competitions.ts` says "Coming soon", but that is only the landing-page marketing
  strip; it gates nothing.
- **From phase 4 onward the balance flips.** Live leaderboard (ranks, arrows, realtime),
  Results depth (a different input control), Table mode (a genuinely new drag-to-order
  screen) and the wizard are mostly front-end builds.

### ✅ Live and working

| Layer | State | Evidence |
|---|---|---|
| Schema | Nine `league_*` tables | migrations 050, 053, 054a/b, 055, 056, 057 applied |
| Season data | 1 season · 20 clubs · 38 matchweeks · **380 fixtures** | direct count |
| Fixture sync | Multi-tenant via `loadSyncTargets`, every minute | **9 fixtures written with real timestamps across 22–23 Aug** |
| Matchweek locks | `lock_at` at first kickoff; silent-skip trigger | trigger present on `league_predictions` |
| Pool creation | Web wizard → `league_season_id` server-side, mode forced to `league_pickem` | 2 pools exist, both created this way |
| Read adapters | clubs→`Team`, fixtures→`Match`, matchweeks→`PoolRoundState`, picks→`Prediction` | `lib/league/read.ts` |
| Write path | `league_predictions` upsert with read-back; a dropped row is a 409 | `lib/league/write.ts` |
| Scoring | `league_score_fixture`, idempotent, corrections take points back | migration 055/057 |
| Leaderboard totals | `readSource` → `'league'` → `league_entry_totals` | `readSource.ts:92,151` |
| **Soft deletion** | **All four doors retire instead of destroying; restore returns a full season** | migrations 056 + 057, `scripts/verify-soft-delete.ts` |
| **Matchweek rhythm** | **Exactly one matchweek open, self-driving** | `1 completed · 36 locked · 1 open` on both pools |
| Containment | League write path never touches `has_submitted_predictions` / `.point_adjustment` | asserted by test |

### ✅ L-A — CLOSED

`PTQPZ797` (3 real members) had `league_season_id = NULL` and every league branch is gated
on that column, so its members saw an empty pool for eight days. Backfilled, un-archived,
38 stale `pool_round_states` rows deleted, and its `prediction_deadline` moved to the
season's last kickoff in the same statement — without that, `computeReveal` would have
fallen to an already-past pool-wide deadline and exposed every member's whole entry.

Rollbacks: `drafts/2026-08-24_ptqpz797_*.sql`. **Still owed: a human clicking through in a
browser as a member.** That needs one of the three members' credentials and cannot be done
by an agent.

### 🟠 Real gaps behind the ✅s — each still true unless struck

1. **League ranks are never computed.** Nothing writes `league_entry_totals.final_rank` or
   `.previous_final_rank` (**0 rows have one**). No rank number, no movement arrows.
   ⚠ When the rank writer is built it **must** carry `retired_at IS NULL` — see §0.7.
2. **The realtime leaderboard does not fire for a league.**
   `broadcast_pool_leaderboard` is attached to `shadow_entry_totals` only; the trigger was
   never created on `league_entry_totals`. Members must refresh. This contradicts the
   live-standings product guarantee.
3. **The outbox has no producer and no consumer.** `league_score_events` holds **0 rows**.
   No XP, badges, result pushes or cache invalidation for a league pool.
4. **Five read paths have no league arm** and return empty by design (`leagueNotImplemented`,
   `readSource.ts:267`). Form tab, XP breakdown and badges are blank.
5. **Mobile has zero league code.** No file under `mobile/` references any `league_*` table.
6. ~~`app/competitions.ts` advertises "Coming soon" with a stale "cannot score" comment.~~
   **Comment corrected 2026-08-24.** The flag deliberately stays `'upcoming'`: its own rule
   is *flip to 'open' only when a real matchweek has been scored and hand-checked*, and
   nothing has ever been scored. It gates only the marketing strip.
7. **No league table anywhere.** `StandingsTab.tsx` is the World Cup's group standings.
   Required by Table mode — and per §0.3 it must come from `/standings`, not be derived.
8. **No mode or depth storage.** `pools` carries `prediction_mode` + `league_season_id` and
   nothing else; `pool_settings` is 50 bracket-shaped columns with no league prices.

### 🔴 Found 2026-08-24 evening — new, not previously recorded

9. **Two fixtures carry fabricated results.** `MW1 fx10` and **`MW12 fx111`** are
   `is_completed = true` at 2–1 with `last_synced_at = NULL` and `manual_override = false` —
   they never came from the feed. Residue from the 055 engine verification. Consequences: a
   **November matchweek has a result in August**, and MW1 reads "10 of 10 completed" when
   only 9 are real. The matchweek rhythm lands on the same open matchweek either way (MW1's
   lock has passed, so it is skipped regardless), but the Results view and the `/standings`
   cross-check will both be wrong. **Clear these two before the standings work.**
10. **There is no catch-up scoring.** The sync arm only scores fixtures whose values
    *changed* on that tick (`syncLeagueFixtures.ts:435`). The nine real MW1 fixtures
    completed 22–23 Aug; migration 055 landed on the 24th, so they were **never scored** and
    nothing will ever score them. Harmless at 0 predictions; a silent hole the moment
    anybody picks. Needs a replay/backfill pass — `rescoreRestoredEntries` already does
    exactly this shape for restores and can be generalised.
11. **`CreatePoolModal.tsx:114` carries a stale comment block** claiming *"leagues are OFF
    the wizard"* and *"a league pool cannot score"*. Both false — the query on line 133
    includes `format.eq.league`, and 055 scores. Same class of stale-comment hazard as the
    one corrected in `app/competitions.ts`.
12. ⚠ **Latent landmine, fix before May 2027.** `lib/auto-submit.ts` selects pools on
    `prediction_deadline < now()`. League pools escape only because their deadline sits at
    the season's last kickoff (2027-05-30). When that passes, league entries get swept and
    `has_submitted_predictions` / `auto_submitted` are set on them — **the two columns that
    are the only doors into the World Cup scoring selectors**, i.e. the load-bearing
    containment constraint. It also does not filter `retired_at`.
13. **World Cup rank writers ignore `retired_at`.** `shadow_finalize_totals` and
    `lite_recalc_entry` assign ranks without the predicate, so a retired World Cup entry
    consumes a rank and leaves a visible gap (1, 3, 4…). Dormant — the WC completed
    16 Jul 2026.

### 📋 Still deferred from the vertical slice §5

The XOR / `DROP NOT NULL`, the 50-site `CompetitionRef` sweep, six containment selectors,
notifications, admin/ops, analytics/XP/badges — and `advance-teams` reading
`matches`/`teams`/`match_conduct` tournament-wide and unscoped, required **before a second
competition**.

---

## 1b · Next steps, in order

**Immediately, before anything else — two of these are minutes, one needs a person:**

| | Action | Why now |
|---|---|---|
| a | **A human clicks through `PTQPZ797` as a member and makes one pick** | The only thing that converts the whole stack from "verified by script" to "known to work". Everything below is built on the assumption that picking works, and no human has ever done it. Needs a member's credentials. |
| b | Clear the two fabricated fixture results (gap 9) | They corrupt any standings work, and phase 7 scores against standings |
| c | Fix the stale `CreatePoolModal` comment (gap 11) | One comment; it actively misleads the next reader |

~~Decide on migration 058~~ — **applied 2026-08-24.** Verified both directions on scratch
data: a pick for the open matchweek is stored, one for a later matchweek is refused, and the
already-played rule still holds. `scripts/verify-matchweek-rhythm.ts`. ⚠ It silently drops a
rejected pick (inherited from the lock rule, chosen knowingly) — so **any script that seeds a
whole season of picks up front will keep only the first matchweek's**. That is what broke
`verify-soft-delete.ts`, now fixed by picking week by week.

**Then phase 4 — the live leaderboard (4–5 days), the biggest single item.** Four parts,
and they are mostly front end:

1. **Ranks** — write `final_rank` / `previous_final_rank`. Rung 5 of the cascade is
   `MIN(league_predictions.created_at)` (§6); `previous_final_rank` snapshots per matchweek
   into the unused `league_matchweeks.ranks_snapshot_at`. **Must filter `retired_at IS NULL`.**
2. **In-match scoring** — change the call-site condition in `syncLeagueFixtures.ts:436`
   (`if (!c.is_completed) continue`), not the engine; it is already idempotent. Fold the
   catch-up pass (gap 10) in here.
3. **Pushed updates** — create `broadcast_pool_leaderboard` on `league_entry_totals`
   (gap 2). The column names were already chosen so the trigger is inherited unchanged.
4. **Movement arrows in the UI** — the front-end half.

Then: Results depth → notifications → live table from `/standings` → Table mode → wizard
and weekly reveal. Unchanged from §0.12.

---

## 2 · Where this sits against Decision 9

Decision 9 settles the grid. One cell is built.

| | Results (H/D/A) | Scores (exact goals) |
|---|---|---|
| **Pick'em** | ❌ | ✅ **LIVE** |
| **Showdown** | ❌ | ❌ |
| **Last Man Standing** | ❌ (no depth axis) | |

Final Table add-on: ❌. **Full Table Prediction: new — §3.**

Decision 9's own warning still stands and is now ten months of consequence: **Scores is
the wrong default for a 38-matchweek season** — 760 numeric decisions versus 380 taps —
and Results was supposed to be the pre-selected recommendation. Shipping Scores-only
inverts it. That makes **Results depth the highest-value single item in this plan**, and
it is also the cheapest: `getWinner()` exists, the engine already resolves
winner-vs-winner, and it is a mode flag rather than a second engine.

---

## 3 · Full Table Prediction

> ⚠ **Superseded in part by §0.** It is a **standalone mode**, not an add-on (§0.2), and the
> actual table comes from the **`/standings` feed**, not from `league_actual_table()`
> (§0.3). The profiles, schema, lock semantics, input UX and point values below all stand.

> Ryan, 2026-08-24: *"at the beginning of the season, or whenever a person opens a pool,
> they're able to predict where they think all the teams are gonna be placed … and then
> that is set for the entire season."*

### 3.1 This contradicts a recorded decision — flagging it, then building it

Decision 9 defines **Final Table** as *"champion, top four, relegation — the things people
argue about, **not twenty positions nobody has an opinion about**"*. The request is
precisely the twenty positions. Per `CLAUDE.md` that must be said out loud rather than
quietly diverged from.

**The objection was about the ask, not the storage** — input burden, not schema. And it is
answerable: an ordered list of 20 clubs is one drag-to-sort screen, done once, pre-seeded
with last season's finishing order so a disengaged member can accept a sensible default in
one tap. That is a materially smaller ask than 760 scorelines, which we already ship.

**The resolution keeps both.** Store the full ordering always; make *what gets paid for* a
setting:

| Profile | Positional points | Headline bonuses | Equals |
|---|---|---|---|
| `full_table` (new default for the add-on) | ✅ per club, distance-decayed | ✅ | Ryan's request |
| `headline_only` | ✖ zeroed | ✅ | Decision 9's Final Table, exactly |

One mechanic, one table, one input screen, two price profiles. Decision 9 is not
overturned — it becomes a configuration of this.

### 3.2 Disclosure gate

> *"Rank all 20 clubs before the season locks. You score for every club you place close to
> where it actually finishes, plus bonuses for the champion, the top four and the three
> that go down. It's shown against the real table all season."*

Passes: the whole mechanism fits in a tooltip, and every ounce of uncertainty is the
league's own (gate 5 of Decision 8). Nothing random is added by us.

### 3.3 Schema

```sql
-- migration 0NN_league_table_predictions.sql
CREATE TABLE league_table_predictions (
  entry_id           uuid NOT NULL REFERENCES pool_entries(entry_id) ON DELETE CASCADE,
  club_id            uuid NOT NULL REFERENCES league_clubs(club_id)  ON DELETE CASCADE,
  predicted_position integer NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, club_id),
  CONSTRAINT ltp_position_ck CHECK (predicted_position BETWEEN 1 AND 30),
  CONSTRAINT ltp_one_club_per_position UNIQUE (entry_id, predicted_position)
    DEFERRABLE INITIALLY DEFERRED   -- a drag-reorder swaps two rows in one statement
);
```

`DEFERRABLE INITIALLY DEFERRED` is load-bearing: reordering swaps two positions inside one
transaction and an immediate unique check would reject the intermediate state.

Pool-level configuration (additive columns on `pools`; **the migration ships before any
code names them**, per the `entry_xp_state` lesson):

```sql
ALTER TABLE pools
  ADD COLUMN league_table_enabled  boolean     NOT NULL DEFAULT true,   -- decision: ON by default
  ADD COLUMN league_table_profile  text        NOT NULL DEFAULT 'full_table',
  ADD COLUMN league_table_lock_at  timestamptz;
ALTER TABLE pools ADD CONSTRAINT pools_league_table_profile_ck
  CHECK (league_table_profile IN ('full_table','headline_only'));
```

`league_table_enabled` defaults **true** so a new pool gets the season-long argument without
an admin having to find a setting; the create-pool wizard offers a switch to turn it off.
`PTQPZ797` and `9XJ8Q5KT` are backfilled to **false** in the same migration — their
`league_table_lock_at` would already be in the past, so offering the screen would be a lie.

### 3.4 The lock — answering "or whenever a person opens a pool"

A pool created in November cannot ask for a prediction whose deadline was August; a member
joining in November must not predict a table that is 29 weeks decided. Both are solved by
making the lock a **pool-level** fact, set once at creation:

> `pools.league_table_lock_at` = the **first kickoff of the first matchweek that had not
> yet locked when the pool was created.**

- Everyone in a given pool faces the same deadline ⇒ scores stay comparable.
- A pool started mid-season still gets a real, live prediction.
- A member who joins after that lock sees the table screen **read-only**, labelled *"closed
  before you joined"*, and scores 0 on the component — **decided (11)**. They still see the
  live comparison and everyone else's predictions. Honest, disclosed, and survivable because
  the slice is small (§3.5). The alternative — excluding the component from their denominator
  — was rejected: it breaks comparability, and two members' totals would stop meaning the
  same thing.

Enforced the same way matchweek locks are — a DB-level silent-skip BEFORE trigger, because
mobile writes directly and the UI is not a gate:

```sql
CREATE FUNCTION enforce_league_table_before_lock() RETURNS trigger …
-- RETURN NULL when now() >= the entry's pool.league_table_lock_at
```

The write path reads back and reports, exactly as `saveLeaguePredictions` does.

### 3.5 Scoring

⚠ **SUPERSEDED BY §0.3 — do not build this.** A derived table cannot see points deductions
(Everton −10 then −8, Forest −4 in 2023/24) and Table mode *scores against* it. The source of
truth is api-football's `/standings`; the derivation below survives only as a cross-check
that raises when the two disagree.

~~The actual table is DERIVED from completed fixtures~~ — the `lib/podium.ts` trick.

```sql
CREATE FUNCTION league_actual_table(p_season_id uuid)
RETURNS TABLE (club_id uuid, position int, played int, won int, drawn int,
               lost int, gf int, ga int, gd int, points int)
-- 3 / 1 / 0 over league_fixtures WHERE is_completed
-- ORDER BY points DESC, gd DESC, gf DESC, name ASC
```

⚠ Real Premier League order is points → GD → GF → **head-to-head**. H2H is a refinement,
not a v1 blocker (it separates ~1 pair a season); `name ASC` keeps v1 deterministic.
**Decided (13): ship `name ASC`**, record it as a known simplification, and show it in the
table's own footnote. It only bites at all if a tied pair straddles a bonus band — 4th/5th
or 17th/18th — so revisit when a real case appears, not before.

**Per-club points, distance-decayed:**

```
club_points = max(0, table_exact_points − table_step_penalty × |predicted − actual|)
```

Defaults `table_exact_points = 100`, `table_step_penalty = 20` ⇒ exact 100, one out 80,
five out 0. Explains in one line and rewards being close, which is what people argue
about.

**Headline bonuses**, on top and in both profiles:

| Bonus | Default |
|---|---|
| Champion correct | 500 |
| Top four — per club correct *as a set*, order-free | 100 each |
| Relegated three — per club correct *as a set*, order-free | 100 each |
| Perfect top four (all 4, order-free) | 250 |

Set-based, not positional, because "who finishes top four" is the actual argument; ordering
inside it is already paid for by the positional term.

**Where it lands:** `league_entry_totals.bonus_points`. `league_score_fixture` already
recomputes `total_points = match_points + bonus_points + point_adjustment` and explicitly
does not touch `bonus_points`, so the two functions compose with **no change to migration
055**. Decision 9's *"Final Table scores into `bonus_points`, so it becomes rung 4 for
free"* holds — no new tiebreak code.

**Sizing the slice** (Decision 9 leaves the number open). At 100/75/50 per fixture and 380
fixtures, a full season is ~20–30k match points. The table above pays a perfect entry
~2,000+800+250+500 ≈ 3,550, or **roughly 12–15%** of a season. That is big enough to matter
in a tight finish and far too small for August to outrun a season played well. **Decided (10): these defaults ship as
written.** They remain `league_pool_settings` columns, so a pool can move them later without
a migration.

**When it is scored — DECIDED (9): scored live.** Recomputed whenever a fixture completes
(the table only moves then), labelled *provisional* until the final whistle of matchweek 38.
Reasons: Decision 9 already says *shown live against the real table all season*; the memory
*"the leaderboard must never lag"* makes a hidden 3,500-point bank a lurch on the last day;
and a season-end reveal is the kind of surprise that makes bad feelings.

### 3.6 Input UX

One screen, reachable from the pool until `league_table_lock_at`:

- 20 club rows, drag to reorder, position number on the left, crest and name.
- **Pre-seeded from `league_actual_table()` as it currently stands, falling back to
  alphabetical** when no fixture has completed yet — **decided (12)**, so the lazy path is one
  tap, not twenty drags.
  ⚠ The original wording said *"last season's finishing order"*. **There is no prior season:**
  `league_seasons` holds exactly one row (2026/27) and `league_clubs` carries no prior
  position — verified 2026-08-24. Importing 2025/26 purely for standings was rejected as a new
  ingestion path that would *still* need a fallback, because the three promoted clubs have no
  prior position either. Seeding from the table we already derive costs nothing, works for
  every future league automatically, and is honest about what it is: *the table as it stands*.
- Position bands shaded: 1 (champion), 1–4 (top four), 18–20 (relegation) — the three
  things that pay bonuses, visible while you drag.
- After lock, the same screen becomes the **live comparison**: your predicted position, the
  actual position, the delta, and points currently earned per club. This is the
  self-refreshing argument Decision 9 wanted.

---

## 4 · The plan

Phases are ordered by dependency; the day estimates are working days and assume the
vertical-slice pace. **L-A, L-B and L-C are the launch-critical spine.**

### L-A — Make the live pool actually work *(0.5 day)* 🔥

The only phase with a member currently affected.

1. ~~Backfill `PTQPZ797`~~ **— DONE 2026-08-24.** `league_season_id` set after asserting the
   `(provider, league, season)` triple agreed, and `prediction_deadline` moved to the season's
   last kickoff in the same statement to close the reveal hole. Rollback:
   `drafts/2026-08-24_ptqpz797_backfill_rollback.sql`.
2. ~~Verify no rows were written to `predictions` for its three entries~~ **— DONE, 0 found.**
   Nothing to clean up.
3. **Un-archive `PTQPZ797`** (decision 1). It is `archived_at = 2026-08-22` and hidden from its
   three members. Note migration 044 predates the league tables, so `league_predictions` has no
   archive gate in RLS — archiving never actually blocked a pick, it only hid the pool from the
   people who would make one.
4. **Delete its 38 stale `pool_round_states` rows** (decision 2), scoped to that `pool_id`,
   capturing the rows into a rollback file first. Inert today — a league pool derives round
   state from `league_matchweeks` — but a trap for the next audit.
5. **Click through both pools in a browser**, as the member: fixtures render, a matchweek
   takes picks, a locked matchweek refuses them and *says so*, the leaderboard shows a
   number. This is the check nobody has done. MW1 has already locked, so `PTQPZ797`'s members
   pick from MW2 onward.
6. Flip `app/competitions.ts` Premier League to `open` and delete the stale comment — only
   after step 5 passes.

*Verify:* `select count(*) from pools where prediction_mode='league_pickem' and league_season_id is null` returns **0** (already true), `archived_at is null` on `PTQPZ797`, zero `pool_round_states` rows for it, and — the one that actually matters — a screenshot of a real pick landing in `league_predictions`, which holds **0 rows database-wide** as of this writing.

### L-B — The things the ✅s imply *(3–4 days)*

Closing the four gaps in §1's 🟠 list that make a league pool feel broken even when it scores.

- **`league_finalize_ranks(p_pool_id)`** — writes `final_rank` / `previous_final_rank`
  using Decision 9's canonical cascade **verbatim**: `total_points DESC, exact_count DESC,
  correct_count DESC, bonus_points DESC, predictions_submitted_at ASC NULLS LAST`.
  Rung 5 is **`MIN(league_predictions.created_at)` per entry** — decided (3). It cannot be
  `pool_entries.predictions_submitted_at`: that column stays NULL for league entries by
  design, because the league write path never touches `pool_entries` (§7.2).
  Called at the end of `league_score_fixture`, ranking in SQL per the architecture rule.
  **`previous_final_rank` compares against the previous matchweek** — decided (4) — snapshotted
  when a matchweek fully completes, into the unused `league_matchweeks.ranks_snapshot_at`.
  `final_rank` itself stays live; only the movement arrow is weekly.
- **Realtime broadcast** — attach `broadcast_pool_leaderboard` to `league_entry_totals`
  (INSERT + UPDATE), which is what migration 050's column naming was for. Restores the
  live-standings guarantee.
- **Outbox drain** — write `league_score_events` from `league_score_fixture`, and add a
  consumer (Vercel cron, claim → process → mark) that fans out result pushes, XP, badges
  and cache invalidation. Idempotent per `(pool_id, fixture_id, kind)`; the unique-pending
  index is already there.
  ⚠ `league_score_events.kind` is CHECK-constrained to `('fixture_scored','pool_rescored')`.
  **Widen it here** (decision 5) to also allow `matchweek_opened`, `lock_reminder`,
  `matchweek_completed` and `table_deadline`, so L-F is "write the producers and handlers"
  rather than "migrate the outbox, then build".
- **`readSource` league arms** for the five `leagueNotImplemented` readers, over
  `league_match_scores`. Form tab, XP breakdown and badges come alive.

*Verify:* ranks present and moving; a second browser tab updates without refresh; the
outbox drains to zero; the Form tab shows real numbers.

### L-C — Results depth *(2–3 days)* 🔥 *highest product value*

> ✅ **SHIPPED 2026-08-24** — migrations **064** (the XOR + `pools.league_depth`, locked at
> creation), **065** (score rows record a tap — **not in this plan**, and without it the
> engine could not write a score row for a Results pick at all), **066** (the engine branch,
> judge-first/price-second). Plus `MatchweekResultsForm`, the write path as a discriminated
> union, and `deriveRoundSubmissions` counting taps — without which a Results pool would
> never show a matchweek as submitted. Verified side by side on one fixture:
> `scripts/verify-results-depth.ts`.

Decision 9's pre-selected recommendation, currently absent.

- **Migration first, before any code names the column:**
  `ALTER TABLE league_predictions ADD COLUMN predicted_outcome text CHECK (predicted_outcome IN ('home','draw','away'))`
  plus a CHECK that exactly one of `(predicted_home_score, predicted_away_score)` and
  `predicted_outcome` is populated.
  ⚠ **`predicted_home_score` and `predicted_away_score` are `NOT NULL` today** (migration
  050). The XOR CHECK is unsatisfiable until both take `DROP NOT NULL` in the same
  migration — verified against the live schema 2026-08-24, and not noted anywhere before.
  ⚠ **Do not encode H/D/A as 1-0 / 0-0 / 0-1** — Decision 9 names this explicitly: sentinel
  scorelines score as genuine `exact`s and show members a fabricated prediction they never
  made.
- **Depth storage:** `pools.league_depth text CHECK IN ('results','scores')`, **locked at
  creation** by DB trigger — mobile writes directly and mixed depths make weekly scores
  incomparable and break Showdown.
  **Default `'results'`** (decision 6), restoring Decision 9's pre-selected recommendation.
  Backfill the two existing pools to `'scores'` in the same migration so nothing they have
  already done changes.
- **Engine:** a branch in `league_score_fixture`, not a second function. Results collapses
  the ladder to `winner` / `miss`; `exact_count` goes inert and the cascade quietly runs
  four rungs, which is expected.
- **Prices:** `league_pool_settings` (below) gets `results_correct` (default 100).
- **UI:** three-way segmented control per fixture instead of two steppers.

### L-D — League settings + a real table *(2 days)*

- **`league_pool_settings`** — a new table, not more columns on the 50-column bracket-shaped
  `pool_settings`. Holds the flat prices, the Results price, the Full Table prices and the
  bonus values. `league_score_fixture` prefers it and **falls back to `pool_settings.group_*`**
  so existing pools keep their behaviour.
- **`league_actual_table(p_season_id)`** (§3.5) + a `LeagueTableTab` rendering it. Useful on
  its own — a league pool should show the league — and it is the substrate for L-E.

### L-E — Full Table Prediction *(3–4 days)*

> ✅ **SHIPPED 2026-08-24** — migrations **077** (`league_mode` as a first-class
> column, the mode/depth CHECK, the profile and the pool-level deadline, both
> immutable), **078** (`league_table_predictions` + RLS + the silent-skip lock),
> **079** (`league_pool_settings`, Table values only), **080**
> (`league_score_table`, `league_standings_final` and the season-end snapshot),
> **081/082** (`league_table_breakdown`, so the per-club formula exists once).
> Plus `TablePredictionTab` (drag with `@dnd-kit`, band shading, then the live
> comparison), the API route, the `league_after_standings_change` wiring into
> the fixtures sync, and `scripts/verify-table-mode.ts` — which asserts the four
> scores rather than describing them, and proves the snapshot is what stops a
> feed correction restating a paid award.
>
> ⚠ **NOT built here, and the plan puts them elsewhere:** the `table_deadline`
> notification (the kind is in the CHECK, no producer exists — it is L-F's last
> unbuilt kind, and a Table pool needs it or a member who never opens the screen
> hears nothing all season); the create-pool wizard that would let anyone
> actually CHOOSE this mode (L-O); mobile (L-G).
>
> ⚠ **Migration 081 named a column that does not exist** (`league_clubs.club_name`;
> it is `name`). plpgsql resolves column references at RUN time, not CREATE
> time, so it applied cleanly and would have failed in front of a member. 082
> fixes it; 081 is left as applied so the file and the database still agree.

Everything in §3: `league_table_predictions`, the pool columns, the lock trigger, the input
screen, `league_score_table(p_pool_id)` writing `bonus_points`, and the live comparison
view. Depends on L-D for the actual table and the settings home.

### L-F — Notifications *(3–4 days)*

Per-competition cadence, not the global World Cup crons. Matchweek opens · lock reminder
(`lock_reminder_sent_at` and `open_notified_at` are already columns on `league_matchweeks`,
unused) · results are in · table-prediction deadline. Fired off the L-B outbox so pushes
have a durable owner. Email voice stays plural "we".

### L-G — Mobile *(4–5 days)*

Currently zero league code. Port `lib/league/read.ts`/`write.ts` shapes, the matchweek
picker, the leaderboard, and the Full Table screen. Ships as an OTA — **per platform, from
`mobile/`**, and only after the API side is deployed.

### L-H — Admin & ops *(2–3 days)*

Season import from the UI, manual fixture override (`manual_override` / `manual_override_by`
already exist and are unused), pool re-score, matchweek re-open, and a league arm in the
super-admin project dashboard.

### L-I — Second league: La Liga / Bundesliga / Serie A / Ligue 1 *(2–3 days + 1 day each)*

⚠ **The slice plan forbids a second league until the two competition columns cannot
disagree.** Its stated remedy is the XOR — `tournament_id` NULL — which drags in the
50-site `CompetitionRef` sweep, 34 of them raw selects.

**Cheaper remedy that buys the same safety — DECIDED (7):** keep both columns populated and
add a **consistency trigger** asserting that `league_season_id`'s season and
`tournament_id`'s row resolve to the same `(external_provider, external_league_id,
external_season)` triple. That is the actual hazard — *disagreement*, not *duplication* —
and it removes the blocker without the sweep. The XOR then becomes cleanup, not a
prerequisite.

Also required before the second competition, and already on the register:
- **R16** — scope `advance-teams`' `matches` / `teams` / `match_conduct` reads by tournament
  (it carries its own blocker comment), plus the four `scripts/*.ts` whole-table conduct
  reads, including `audit-bonuses.ts`.
- Run `scripts/verify-select-columns.ts` and `scripts/verify-read-paths.ts` before enabling
  any new competition.

Per league after that: import + a slug, a crest set, matchweek count (Bundesliga is 34, not
38 — `league_matchweeks_no_ck` already allows 1–60) and a smoke pool. The schema is already
competition-agnostic; `league_seasons` is keyed on the provider triple.

### L-J — Showdown *(6–8 days)*

> ✅ **SHIPPED 2026-08-24** — migrations **083** (`league_duels` + the circle-method
> generator), **084** (3/1/0 duel scoring, `duel_points` leading the rank cascade,
> and the settle trigger), **085** (a totals row for every entry, even on zero).
> Plus `lib/league/duels.ts`, the `DuelsTab`, the wizard card, and schedule
> regeneration wired into creation, joining and retiring.
> Verified by `scripts/verify-showdown.ts`, which asserts the round-robin
> property itself — every pair exactly once per cycle, byes rotating, no opponent
> count differing by more than one.
>
> 🔴 **The pairing OVERTURNS the concept note, on gate 5.** The May spec says
> *"every Monday the system randomly pairs all active players."* That fails
> Decision 8's fifth gate — *all uncertainty must be inherited from the sporting
> event; randomness we add is gambling design whether or not money moves* —
> because a member's duel points would depend on **who they happened to draw**,
> and across 38 matchweeks that does not average out. **Ryan's call: published
> round-robin.** The concept note already pointed at it (*"full round-robin across
> the season"*), and it strengthens the note's own argument that the appeal is
> mimicking a real league, which has a fixture list rather than a weekly draw.
>
> ⛔ **Double Down is NOT built**, on the precedent that already rejected the
> banker: Decision 9 refuses a nominate-this-one-to-count-double mechanic on the
> disclosure gate, as pools jargon that must be taught before a first pick. Double
> Down is the same shape one level up. Ryan confirmed leaving it out of v1.
>
> ⚠ **Owed:** the concept's SECOND tiebreak — lifetime head-to-head between tied
> players — is not implemented. It is pairwise, so it cannot be expressed as a
> sort key over one row, and approximating it would quietly pick a different
> champion. Also not built: the tunnel-walkout reveal (animations backlog),
> pre-duel trash talk (banter), and duel notifications (the outbox kind would
> need widening, as `table_deadline` still does).

A **layer**, not a peer engine: it consumes whichever weekly accuracy number the depth
produces, so it works over Results or Scores without knowing which. Needs a pairing engine,
`league_duels`, 3/1/0 duel scoring, the Banter Cup side-pot, and the reveal notifications
already specced in the Showdown notes. Depends on L-C (a weekly accuracy number that a
casual member will still be producing in November).

### L-K — Last Man Standing *(5–6 days)*

> ✅ **SHIPPED 2026-08-24** — migrations **086** (rounds, survivors, picks, the
> club-once-per-round rule and the matchweek-level lock), **087** (the settlement
> engine, `rounds_won` leading the rank cascade, and the settle trigger), **088**
> (a fix — see below). Plus `lib/league/lms.ts`, the `SurvivorTab`, the wizard
> card, and round one opening at pool creation.
> Verified by `scripts/verify-last-man-standing.ts`, which plays all five ways a
> matchweek can end against the same fixtures.
>
> **The rules, and why each is what it is:**
> - **Your club must WIN.** A draw is not survival — that is what the name means.
> - **No pick is elimination**, not an auto-pick. Choosing for somebody would show
>   them a decision they never made, which is the class of wrongness Decision 9
>   forbids when it rules out sentinel scorelines.
> - **A club whose fixture never completed SURVIVES.** Being knocked out by a
>   match that was called off is a bad feeling with no sporting cause. Mildly
>   gameable, and the club-once-per-round rule prices it in: you burned one of
>   your twenty on nothing.
> - **A club may be used once per round.** Without it everyone picks the best team
>   every week and the mode is a coin-flip with extra steps.
> - **Everybody out in the same matchweek shares the round.** They lasted equally
>   long; a round with no winner is a worse answer to the same football.
>
> ⚠ **A late joiner enters the NEXT round, not the one running.** Everyone in the
> current round has spent clubs on it, and dropping somebody in with a full set of
> twenty hands them an advantage nobody else had. The wait is bounded by round
> length — which is the same reasoning that made rounds repeat.
>
> 🐛 **088 exists because the lock trigger was too broad.** 086 attached it to
> every column, so when the engine wrote `result` back onto a pick it hit the
> trigger's own "somebody already out cannot keep picking" guard and was silently
> dropped. Eliminations were recorded correctly, but **every eliminated player's
> pick stayed `result = NULL` forever** — a member looking back at the week they
> went out would have seen no verdict on the club they chose. `UPDATE OF club_id,
> matchweek_number` says what was always meant.

Repeating rounds, not one elimination — at ~7.6 members and ~65–70% weekly survival a single
round is over in five or six of thirty-eight matchweeks, and a pool dead in September fails
the purpose clause. Round closes when all are out, a new one opens next matchweek, season
score = rounds won. ⚠ **Locks at matchweek level, not per match** — the existing trigger
locks at each fixture's kickoff, so a Sunday picker would otherwise see Saturday's results.

### L-L — Full L4 cleanup *(3–4 days, any time after L-I)*

The XOR, the `DROP NOT NULL`s, the `CompetitionRef` sweep, the remaining six containment
selectors, and the mode/deadline CHECKs. Now cleanup rather than a blocker.

---

## 5 · Sequencing

```
L-A ──> L-B ──> L-C ──┬──> L-D ──> L-E        (Full Table)
 fix     ranks   Results │
 live    realtime  depth ├──> L-F ──> L-G     (notifications, mobile)
 pool    outbox          │
                         ├──> L-J             (Showdown)
                         └──> L-K             (LMS)

L-H (admin/ops)  — any time after L-B
L-I (2nd league) — needs the consistency trigger + R16; independent of C/D/E
L-L (full L4)    — cleanup, after L-I
```

**Minimum for "the Premier League is a real product": L-A + L-B + L-C.** Roughly **6–8
days**. Everything after that is breadth.

**Minimum for Ryan's Full Table request on top: + L-D + L-E** ⇒ **11–14 days** total.

Full grid including Showdown and LMS: **~40 days**. Second league adds 3–4.

---

## 6 · Settled decisions — Ryan, 2026-08-24

All thirteen open questions were put to Ryan and answered in one pass. **Nothing below is
still open.** Each row is binding; if the build wants to diverge from one, say so out loud
rather than diverging quietly.

| # | Question | Decision | Phase |
|---|---|---|---|
| 1 | `PTQPZ797` still archived | **Un-archive it.** Three real members are waiting; it also makes L-A's click-through a real test rather than a synthetic one | L-A |
| 2 | Its 38 stale `pool_round_states` rows | **Delete**, scoped to that `pool_id`, with a rollback file capturing the rows first | L-A |
| 3 | Decision 9 rung 5 in a 38-week season | **`MIN(league_predictions.created_at)` per entry** — "joined and picked first". Stable once set; never moves | L-B |
| 4 | What `previous_final_rank` compares against | **The previous matchweek.** Snapshot when a matchweek fully completes, using the already-present unused `league_matchweeks.ranks_snapshot_at`. Rank itself stays live; only the *arrow* is weekly | L-B |
| 5 | Width of the `league_score_events.kind` CHECK | **Widen in L-B** to cover the L-F notification kinds (`matchweek_opened`, `lock_reminder`, `matchweek_completed`, `table_deadline`) even though nothing writes them yet. One migration instead of two | L-B |
| 6 | Default depth, and the two existing pools | **`results` is the default for new pools**; `PTQPZ797` and `9XJ8Q5KT` are backfilled to `scores` so their behaviour is untouched. Depth stays locked at creation — no pool ever changes mid-season | L-C |
| 7 | XOR vs consistency trigger | **Consistency trigger.** The hazard is *disagreement*, not duplication. Unblocks the second league without the 50-site sweep; the XOR drops to L-L cleanup | L-I |
| 8 | Full Table vs Decision 9's Final Table | **Two profiles, `full_table` default.** Store the full 20-club ordering always; the profile decides what gets paid for. Decision 9 is not overturned — it becomes `headline_only` | L-E |
| 9 | Table scored live or banked | **Live, labelled *provisional*** until MW38's final whistle. Recomputed whenever a fixture completes | L-E |
| 10 | Size of the table slice | **≈12–15% of a season** — the §3.5 defaults as written. All values are `league_pool_settings` columns and remain movable | L-E |
| 11 | Late joiners | **Read-only, scores 0, said plainly** — *"closed before you joined"*, with the live comparison still visible. Keeps every total in a pool comparable | L-E |
| 12 | What pre-seeds the table screen | **`league_actual_table()` as it stands, else alphabetical.** No prior-season import — see §3.6 | L-E |
| 13 | Head-to-head in `league_actual_table` | **v1 simplification.** `name ASC`, recorded as known, shown in the table's own footnote. Revisit when a real case appears | L-D |

Two further decisions taken in the same pass, recorded where they bind:

- **The Full Table add-on is ON by default for new pools** (`league_table_enabled DEFAULT true`,
  admin can switch it off at creation). `PTQPZ797` and `9XJ8Q5KT` stay off — their lock would
  already have passed. See §3.3.
- **The consistency trigger is not a permanent excuse.** It ships to unblock league #2; §7.4's
  compounding risk stands and L-L remains owed.

### 6b · Second round of decisions — Ryan, 2026-08-24 evening

Taken alongside the eleven changes in §0. Where these disagree with the table above, **these
win** — decisions 12 and 13 in particular are affected.

| # | Question | Decision |
|---|---|---|
| 14 | Free-tier mode allowance, now that Table is a mode | **Free gets Pick'em + Table.** Showdown and Last Man Standing are the paid draw |
| 15 | Rejoin scoring after a soft delete | **Full history restored** — retained predictions re-scored including the away period |
| 16 | When a matchweek opens | **Strictly one at a time**, opening when the previous locks. No working ahead |
| 17 | Source of the actual league table *(revises 12 and 13)* | **The `/standings` feed.** Pre-seed comes from it too; head-to-head stops being ours to solve |

Ryan also confirmed **all four §8 recommendations** from the journeys artifact: soft
deletion over hard delete, Pick'em-at-Results first with Showdown committed, the
Simple/Advanced definition in §0.10, and Table free at every tier.

---

## 6c · 🔴 A postponed fixture freezes Showdown and Last Man Standing

**Found 2026-08-24 by Ryan asking what happens when a match is called off — which
is guaranteed to happen.** Reproduced, not reasoned:

```
fixtures 2 · completed 1 · one postponed
league_snapshot_matchweek_ranks returned  0
ranks_snapshot_at is NULL  ->  the settle trigger NEVER FIRES
the duel: settled_at NULL · points - / -
duel_points rows: []
```

`refresh_league_matchweek_window` counts `count(*)` as the denominator and
`count(*) FILTER (WHERE is_completed)` as the numerator, so a postponed or
cancelled fixture sits in the denominator forever. That gate feeds
`league_snapshot_matchweek_ranks`, and **everything hangs off it**:

| | consequence |
|---|---|
| Showdown | the duel for that matchweek never settles — no 3/1/0, no `duel_points` |
| Last Man Standing | the round never resolves; **it stalls permanently** |
| Weekly arrow | `previous_final_rank` never snapshots |
| "Results are in" | the notification is never produced |

**Postponed** resolves late — months late, since api-football keeps a rearranged
fixture in its original round, so a November duel would settle in February.
**Cancelled is permanent**: it never completes, so that matchweek never settles
at all.

⚠ **Live today, for an unrelated reason:** Premier League MW1 reads 10 of 10
complete and `ranks_snapshot_at` is still NULL, because those fixtures finished
before the engine existed and carry no `league_fixture_state` witness (migration
061). The recorded *no catch-up scoring* gap now has a second consequence — a
Showdown or LMS pool on this season would never settle its first matchweek
either.

✅ **FIXED — migration 094, Ryan's ruling: settle on what was played.** A
matchweek settles when every fixture is played, **or when its window has closed**
— the next matchweek has locked — on whatever actually happened. The final
matchweek has no next one, so there the window closes when nothing is still
playable (every fixture completed or cancelled).

⚠ **Not `last_kickoff_at`.** It looks like the natural signal and is a trap:
`refresh_league_matchweek_window` sets it to `max(kickoff_at)`, so a fixture
rearranged to February would push a November matchweek's window into February —
exactly the stall being removed.

**Neither engine needed changing.** Showdown sums the score rows that exist, so
both duellists are judged on the same played list; LMS already said a club with
no completed fixture survives — a rule written in 087 that until now never got to
run. When the postponed match is finally played it scores normally into the
member's total, but **the duel does not reopen**: `league_score_duels` only
touches `settled_at IS NULL`, because a settled duel is a result, not a draft.

**One thing deliberately not relaxed:** a fixture that is COMPLETED but carries
no `league_fixture_state` witness still blocks. That is the engine being behind,
not a called-off match, and settling then would settle a week whose scoring had
not finished. ⚠ Premier League MW1 is in exactly that state — the separate *no
catch-up scoring* gap.

Verified by `scripts/verify-postponed-fixtures.ts`, which checks all four
properties independently, including that it does **not** settle early.

## 6d · Catch-up scoring, and the two bugs it exposed

**Done 2026-08-24 — migrations 096, 095, 097.**

Nine Premier League matchweek-1 fixtures finished before the engine existed:
completed, real scores, no `league_fixture_state` witness. Migration 061 needs a
witness before a matchweek may snapshot, so **matchweek 1 could never settle** —
no weekly arrow, no "results are in", and no Showdown duel or LMS round could
ever resolve, because both settle off that snapshot. One gap at the start of a
season quietly disabling two whole modes.

`league_score_missed_fixtures(season)` puts every witness-less completed fixture
back through the engine. Run on production: **9 scored, 1 matchweek, 9
notifications suppressed** — matchweek 1 now snapshots and no fixture is missing
a witness. Zero score rows were written because nobody had picked matchweek 1, so
no member's points moved.

**Notifications are suppressed deliberately.** `fixture_scored` only invalidates
a cache, but `matchweek_completed` sends *"results are in"* — pushing that for a
week that finished days ago is a notification with no sporting cause.

### 🐛 Two bugs found by running it, both the same blind spot

**A mode reaching back into matchweeks played before its pool existed.**

⚠ **Showdown scheduled duels in the past (migration 095).** Six seed pools
created 2026-08-25 each carried **five duels in matchweek 1**, a week played four
days earlier. Nobody could have picked in them, so every one would have settled
0-0 — a draw — paying every member a duel point for a week they were not in. The
generator counted from matchweek 1 for any pool with no settled duels. It now
starts at `GREATEST(last settled + 1, first matchweek still open)`. **LMS and
Table already got this right**, which is what made it findable.

⚠ **LMS settled a round before it began (migration 097) — and the catch-up
triggered it.** The seed pool's round 1 correctly began at matchweek 2, but
snapshotting matchweek 1 fired the settle trigger for matchweek 1. Nobody had a
pick for a round that did not exist yet, so *no pick is elimination* took **all
ten out at once**, and the everybody-out rule made all ten joint winners of a
round they never played. Guarded now by the round's own `first_matchweek`.

**Repaired in full**, scoped to an impossible signature — `last_matchweek <
first_matchweek`, a round that closed before it opened, which cannot be a
legitimate state. Round 1 is open again at matchweek 2, zero eliminations, zero
phantom wins, all eight picks intact, `rounds_won` back to zero.

⚠ **Still there:** matchweek 12 fixture 111, `Arsenal 2-1 Manchester City`. The
catch-up did not touch it — it already had a witness — and the function could not
tell a fabricated result from a real one if it had.

## 7 · Risks

1. **Nothing here has been used by a real person.** 380 fixtures and a scoring function are
   verified by probe; zero picks have ever been made through the UI. L-A's browser
   click-through is the first genuine test and may well find more than it fixes. Budget for
   that.
2. **The load-bearing constraint is still one careless line from breaking.** Any new league
   write path that sets `pool_entries.has_submitted_predictions` or `.point_adjustment`
   "for consistency" opens three World Cup scoring selectors to league entries. It is
   asserted by test — extend that test with every phase.
3. **Scores-only is actively costing engagement right now.** A member who joined in August
   is being asked for 20 numbers a week until May. L-C is not a nice-to-have.
4. **Deferred invariants compound.** L-L is real work that gets more expensive the more
   surfaces exist. It should not slip past the second league.
5. **The engine register must be updated.** Per the scoring architecture rule, every new
   engine gets a row in `SPORTPOOL_PROGRAMME.md` — `league_score_table`,
   `league_finalize_ranks` and any Showdown/LMS engine each need one.
