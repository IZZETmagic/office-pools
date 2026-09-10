# Scouting — design note

**Status:** concept, unapproved. Nothing here is built.
**Date:** 2026-09-09

---

## 1. What it is

A **scout report** is a small, bounded read-only panel that attaches to a *decision*, not to a page.
Wherever the product asks a member to commit — a fixture pick, a duel, an LMS survival pick, a table
prediction — scouting is the affordance that says *here is what has actually happened before*.

It is deliberately **not** a hub. There is no Scouting tab in the nav. The report appears in six
places (§6) and is the same computed object every time.

### The one sentence that governs every stat in it

> **Scouting reports what happened. It never forecasts what will happen.**

This is the difference between *"most common scoreline in this fixture: 2–1"* (a memory) and
*"most likely score: 2–1"* (a tip). The first is a fact about football; the second is a betting
product with the odds filed off, and this product is explicitly not for bettors
(`SPORTPOOL_PROGRAMME.md` → vision). One word, and it decides which product we are building.

Consequences, and they are hard rules:

- No probabilities. No implied odds. No "value" language.
- No projection, no model output, no xG-derived forecast presented as a recommendation.
  (`match_team_stats.expected_goals` exists as of migration 140 — it may be shown as *what
  happened in a played match*, never as an input to a prediction about an unplayed one.)
- No stat is ever phrased as advice. "Chelsea have not won here since 2011" is fine.
  "Back Arsenal" is not.

---

## 2. The data we actually have (verified against schema, 2026-09-09)

Everything below is in the repo today. This matters because it determines what is free and what
costs money.

| Source | Table | Landed | What it gives scouting |
|---|---|---|---|
| Fixtures + results | `league_fixtures` | 050 | Form, venue splits, scorelines, streaks |
| Standings | `league_standings` | 075 | Position, points, ingested — never derived |
| Timeline | `match_events` | 136 | Scorers, assists, cards, subs, minutes |
| Line-ups | `match_lineups` (jsonb) | 139 | Formation, XI |
| Team stats | `match_team_stats` | 140 | Possession, shots, corners, xG, passing |
| **Player stats** | `match_player_stats` | **141** | **Rating, minutes, goals, assists, key passes, duels, tackles, saves — 40 players a fixture** |
| Member picks | `league_predictions` | 050 | Every pick, with `created_at` / `updated_at` |
| Member scoring | `league_match_scores` | 050 | Per-fixture outcome bucket + points |
| Duels | `league_duels` | 083–129 | H2H record, meetings, settled results |

**Migration 141 is the unlock.** It landed four days ago and put per-player ratings and stats into a
real, indexable table at zero additional provider cost — the bytes already arrive in the
`/fixtures?ids=` bundle. Player-level scouting ("who has been the best player in this fixture", "who
is their danger man") went from impossible to a `GROUP BY` on the day 141 applied. Nothing reads
that table yet.

### 2.1 Three gaps that scouting is the first feature to actually need

**(a) There is no cross-season club identity.**
`league_clubs` is keyed `UNIQUE (season_id, external_club_id)` — Arsenal has a *different* `club_id`
in 2026/27 than in 2025/26. Every cross-season query would have to join on `external_club_id` by
hand, in every reader, forever. That is the same shape as the `=== 3` duel-scale bug: one constant,
many sites, silent divergence.

→ **Scouting needs a season-independent `clubs` entity** that `league_clubs` references. The
backlog already wants one for *Team detail page*; scouting is what makes it worth building.

**(b) There is no `players` table.** 141 says so explicitly and stores the provider's
`external_player_id` with no FK, precisely so that adding the entity later is a migration rather
than a rewrite. *Player detail page* is already backlogged. Same argument: scouting is the
forcing function.

**(c) How many seasons of history are actually in production is UNVERIFIED.**
`scripts/import-league-season.ts` takes a year argument, so importing 2025, 2024 is *possible*, but
nothing in the repo shows it has been run for a past season. **This must be checked before any
H2H work is scoped** — it is the difference between a one-day feature and a week of backfill.
It could not be checked from here (the Supabase MCP connector is unauthenticated in this session).

### 2.2 The cheap path to history

`/fixtures/headtohead` is an api-football endpoint this codebase has **never called**. It returns
every prior meeting of a club pair directly — no season import required. One call per *pairing*,
and the answer is immutable once played, so it is cached forever. A 20-club league has 380 orderd
pairings; that is ~380 calls **once**, against a 7,500/day plan.

That is the whole of layer-1 fixture scouting for the price of a single afternoon's quota, and it
sidesteps the "do we have prior seasons" question entirely for scorelines. It does **not** give
player-level history — that still needs the per-fixture detail bundle.

---

## 3. Fixture scouting — Arsenal v Chelsea

Five layers, each of which degrades independently. The report renders however many it has.

### Layer 1 — The pairing
- Meetings played, and W–D–L, **split by this venue** (Arsenal *at home* to Chelsea, not "overall")
- **Most common scoreline in this fixture**, with its frequency: "2–1 — three of the last twelve"
- Goals: average total goals, both-teams-scored %, clean sheets
- The last five meetings as a strip of scorelines with dates
- The streak sentence — the single most interesting derived fact: *"Chelsea have not won at the
  Emirates since 2011."* This is the line people screenshot.

### Layer 2 — Form, split by venue
**This layer always has data**, which is why it is the fallback for everything above.
- Arsenal *at home* this season: last five results, goals for/against per game, clean sheets
- Chelsea *away* this season: the same
- The asymmetry is the entire point. A fortress-at-home / dreadful-away side is the most useful
  single thing a pick'em player can know, and it is invisible on a league table.
- Rolling form over the last six across all venues, as a secondary line

### Layer 3 — People *(new, courtesy of 141)*
- **Top scorer in this fixture historically** — needs history (§2.1c)
- **In form now**: highest average `rating` this season per side, minutes-qualified
- **Danger man**: best goals + assists per 90 per side
- **Who creates**: most `key_passes` per 90
- **Discipline**: most-carded player — relevant because `match_conduct` is a scoring input
- ⚠ Three traps 141 documents and any consumer must respect: `rating` is NULL for unused subs (199
  of 800 sampled rows) and will drag averages if treated as 0; `passes_accurate` is a **count**, not
  a percentage; and **`is_starter` is known-wrong** — the provider sends `substitute: false` for
  whole squads (open bug). Scouting must not filter on `is_starter`; use `minutes > 0`.
- ⚠ `match_events` is authoritative for goals, not `match_player_stats` — the two disagree at source
  (428 vs 430 across 146 fixtures). Goal counts come off the timeline.

### Layer 4 — The crowd *(nobody else has this)*
- "68% of SportPool picked Arsenal"
- The most-picked scoreline across the platform, and how it compares to the historical one
- ⚠⚠ **PLATFORM-WIDE AND ANONYMOUS ONLY, NEVER YOUR OWN POOL.** Picks reveal per matchweek and the
  Showdown draw is sealed. A crowd stat scoped to your pool leaks your pool-mates' picks through the
  back door of an aggregate — and in a 6-person pool an aggregate is not an aggregate. Platform-wide
  is safe because n is large and no member is identifiable. This is a hard boundary, not a
  preference.

### Layer 5 — Honesty about sample size

The user's own framing: *"sometimes the historic data won't be there… it is what it is."* The design
answer is that **the scout never renders an empty state; it renders a smaller report.**

| Meetings | What is shown |
|---|---|
| 0 | "First meeting." Layer 1 is skipped entirely, layers 2–4 carry the report |
| 1–2 | The meetings as **anecdotes** — scorelines and dates. **Never a rate.** |
| 3–4 | Anecdotes plus counts ("Arsenal have won two of the three") |
| 5+ | Rates and percentages unlock |

**Hard rule: no percentage is displayed below n=5.** "50% of the time" on a sample of two is a lie
with a decimal point on it, and this product's stated purpose is no bad feelings — losing a pick to
a stat we oversold is exactly that. The rule is also what makes the feature trustworthy enough to
charge for.

Every rate carries its n inline: *"2–1 in 25% of meetings (3 of 12)"*. Always. No exceptions.

---

## 4. Opponent scouting — the Showdown dossier

**This layer costs nothing.** Every stat below is derivable from `league_predictions` and
`league_match_scores`, which are already written on every pick and every settle. No provider call,
no backfill, no new ingestion. It is the cheapest and most differentiated half of the whole system —
and it should ship first.

The existing *Tale of the Tape* (`DuelsTab.tsx`) already carries the duel record and the meeting
list. The dossier is that card, extended.

### 4.1 Accuracy — the baseline
- Hit rate, exact-score rate, average points per fixture
- Best and worst matchweek, and the season average
- Last five matchweek totals as a sparkline
- Where they rank in the pool on accuracy alone, separate from duel points
  (⚠ a `league` sibling of `lib/analytics/entryAnalytics.ts` is needed — the World Cup version
  reads `predictions`, which is empty for every league entry)

### 4.2 Club bias — the user's idea, and the best one in the set
- **Most-backed club**: as a rate, not a count — "picks Arsenal to win in 9 of their 9 games"
- **Split by venue**: *"backs Arsenal at home 9/9. Away, 3 of 7."* The split is the insight
- **Most-opposed club**: who they consistently pick against
- **The blind spot** — the strongest single line in the dossier: the club they are most often
  *wrong* about. *"Picks Man Utd to win 8 times. Right twice."* Useful, funny, and it is a fact
  about football rather than about a person, which is what keeps it on the right side of banter

### 4.3 Scoreline fingerprint
- Their signature scoreline: *"2–1 in 31% of picks"*
- **Goals per prediction vs the league's actual average** — *"predicts 3.1 goals a game; the Premier
  League averages 2.8."* An optimist, quantified
- **Draw rate vs reality** — nearly everybody under-predicts draws (real ≈ 25%, most players pick
  well under 10%). Seeing your opponent's number next to the real one is genuinely revealing
- **Home-win bias vs reality** (real ≈ 45%)
- Do they ever predict a 0–0? Most people never do

### 4.4 Contrarian index
What share of their picks match the platform majority. Low = contrarian, high = follows the crowd.
The World Cup analytics already have this concept as `crowd_agreement_pct`; the league needs its
own. Pair it with **contrarian win rate** — going against the crowd *and being right* is the stat
that earns respect.

### 4.5 Strength by fixture type
Because a duel is decided on a *difference*, the useful question is not "who is better" but "where
do we differ". Bucket both players' history by fixture type and show the two side by side:

- Home favourite / away favourite / evenly matched
- Top-six clash · derby · relegation six-pointer
- High-scoring fixtures vs low-scoring ones

*"You outscore them on derbies. They beat you on the bottom half."* That is a scouting report.

### 4.6 Reliability
- **Missed-pick rate.** In a duel an opponent who no-shows one week in six is a free win. This is a
  competitive fact — a missed pick has already changed results — and it belongs in the dossier.
- Number of fixtures picked vs available this season.

### 4.7 What is deliberately NOT in it

**Pick timing is excluded**, and this is a design decision rather than an oversight.
`league_predictions.created_at` / `updated_at` make *"usually picks 40 minutes before the
deadline"* and *"changes their pick 3 times on average"* trivially computable. Run the disclosure
gate on it:

> *"We show your opponent what time of day you usually make your picks, and how often you change
> your mind."*

That is surveillance, not scouting. It has never changed a result, it would push people to pick
early purely to hide the signal, and it makes the product feel like it is watching you. The line
that separates it from §4.6 is clean and worth stating once:

> **A scouting stat must describe a decision that has already been revealed and has already
> affected a result. Not the behaviour around making it.**

Missed picks pass. Pick timing does not. Edit-count does not.

### 4.8 The read

One generated sentence at the top of the dossier, composed **deterministically** from the numbers
above — a lookup over thresholds, not a language model:

> *"A high-scoring optimist. Backs the home side, almost never calls a draw, and has an Arsenal
> problem."*

This is the thing that gets shared into Banter, and it should be built to be shared (§6.6).

---

## 5. The other two subjects

**Self-scouting.** Every opponent stat, pointed at yourself. Always free (§7). It is the honest
mirror — *you have never predicted a 0–0 and there have been eleven this season* — and it is the
strongest retention mechanic in the whole design without being a retention mechanic: it is just
your own data, shown plainly, which passes the disclosure gate trivially.

**Club scouting.** Attaches to Last Man Standing and Predict the Table, where scouting is worth
*most* because a single wrong pick ends a run:
- Clubs you have already used (LMS) — with the remaining-fixtures consequence spelled out
- That club's home/away record, form, and the difficulty of what is left
- How many pool members are on the same club this round (⚠ same reveal boundary as §4 layer 4 —
  this may only be shown once LMS picks are revealed for that round)

---

## 6. Where it appears — "parched throughout"

1. **Fixture row in the picker.** A small affordance on each row opening the report as a sheet.
   Never blocks or delays the pick.
2. **Match detail page.** A *Scout* tab beside Timeline / Line-ups / Stats. Those tabs exist from
   136/139/140, so this is the cheapest surface in the list. ⚠ `MatchTabBar` refuses to ship a tab
   that is always present and never has content — layer 2 guarantees it never is.
3. **Showdown pre-duel and walkout.** The dossier, extending the existing Tale of the Tape. Gated
   on `opponentVisible`, exactly as `HeadToHead` already is — the sealed half of a cycle must not
   show a dossier for someone you have finished playing.
4. **LMS pick screen.** Club scouting (§5).
5. **Predict the Table.** Club season scouting.
6. **Banter share card.** A scout report is inherently shareable and share-cards are already ~67%
   of banter traffic. The §4.8 read is the payload.
7. **Pre-lock notification** *(optional, gate carefully)*. *"Three of your ten picks go against the
   platform."* Passes the disclosure gate — it states its own mechanism — but it is the one item
   here that touches notifications and it should be opt-in.

---

## 7. Monetisation — and the fairness problem

The user is undecided. There is one issue that has to be settled before anything else:

> **If one player in a Showdown duel can see the dossier and the other cannot, the competition is
> no longer fair.**

That is pay-to-win inside a head-to-head contest between two named friends, and it is the most
direct possible contradiction of *no bad feelings*. It is also the exact thing the vision doc
already flags as a worry about paywalling banter and XP.

Recommended line, which is defensible in one sentence:

> **You never pay to see something about another person that they cannot see about you.**

Which yields:

| Layer | Model | Why |
|---|---|---|
| **Self-scouting** | **Always free** | It is your own data. Charging for it feels like a hostage |
| **Opponent scouting** | **Pool-level unlock, never per-user** | Symmetry is preserved: the admin buys it and every member gets it. Also monetises *better* — one buyer, whole pool, and the buyer is the person most invested |
| **Fixture / club scouting** | **Per-user tiering is fine** | It is public information about football, not about another member. Free = layers 1–2 headline; paid = depth (player level, splits, crowd) |

The pool-level unlock is a genuinely better product than the per-user one, independent of fairness:
it makes the admin a hero rather than making one member an advantaged outsider, and it fits the
existing pool-payment model that *Sponsored pools* already assumes.

---

## 8. Architecture

**A scout report is computed in Postgres and read as rows.** The scoring architecture rule —
backend computes once, frontends only display — is not literally about scoring; it is about what
happens when web and RN each derive the same number. The duel scale is the standing proof: one
constant, three independent readers, nine settled duels displayed wrong for four days, nothing
errored. A scout report has *forty* numbers in it. It cannot be derived twice.

- **Precompute, do not compute on read.** Reads plus realtime are ~95.9% of DB time; the caching
  note already concludes precompute > cache. Scout aggregates refresh on fixture settle, off the
  existing `league_score_events` outbox.
- **Cache the season, never the pool** — the league read-path cost review's conclusion applies
  unchanged. Fixture/club scouting is season-scoped and shared by every pool in that season, so it
  is cached once and read by all of them. Opponent scouting is entry-scoped and is not cached.
- ⚠ **Bound every read.** PostgREST truncates an unbounded `.select()` at 1,000 rows silently, and
  a season is 380 fixtures × 20 entries. An exact-1,000 count is a bug, not a result.
- **One owner per derivation.** `lib/scouting/` owns every threshold and every bucket boundary
  (what counts as a derby, what n unlocks a rate), with a guard test in the shape of
  `duelPoints.guard.test.ts` that scans for a second implementation.

### Migrations implied

1. A season-independent `clubs` entity, with `league_clubs` referencing it (§2.1a)
2. A `players` entity keyed on `external_player_id`, adding the FK 141 left off (§2.1b)
3. `club_pair_history` — the `/fixtures/headtohead` cache. Immutable once played
4. `scout_club_season` — per club per season per venue: form, goals, results
5. `scout_entry_profile` — the §4 dossier, one row per entry, refreshed on settle
6. `league_entry_analytics` — the league sibling of `entryAnalytics.ts` (§4.1)

⚠ Every one of these must be **applied before the code that names it deploys** — PostgREST rejects
an entire payload for naming a relation that does not exist, which is why 136, 139, 140 and 141 all
carry that warning. And there is a standing deploy gap: `origin/master` has not moved since 24 Aug.

---

## 9. Gate check

The five gates, since this touches engagement and a possible paywall.

- **Disclosure.** *"We show you how this fixture has gone before, and how your opponent has picked
  in games that are already revealed."* Passes plainly. Scouting is information; explaining it
  makes it more attractive, not less — which is the test.
- **Gate 5 — all uncertainty inherited from the sport.** Scouting adds **zero** randomness. It
  *removes* uncertainty, using only what the sport already did. This is the safest possible feature
  shape for this product.
- **The one real risk** is positional, not mechanical: a deep enough stats layer is a betting
  interface with the odds removed, and this product is explicitly not for bettors. §1's rule —
  report, never forecast — is the mitigation, and it has to be enforced in copy review, not just at
  design time.
- **The paywall risk** is §7, and the pool-level unlock resolves it.

---

## 10. Build order

Ordered by *value delivered per provider-dollar spent*, which puts the free half first.

| Phase | What | Provider cost | Blocked on |
|---|---|---|---|
| **0** | **Opponent + self dossier** (§4, §5) — the whole thing, from picks we already store | **none** | `league_entry_analytics` |
| **1** | Fixture form, venue-split (§3 layer 2) — from `league_fixtures` | **none** | `clubs` entity |
| **2** | H2H pairing history (§3 layer 1) via `/fixtures/headtohead` | ~380 calls, once | `club_pair_history` |
| **3** | Player-level, current season (§3 layer 3) — from 141 | **none** | `players` entity; the `is_starter` bug |
| **4** | Crowd layer (§3 layer 4) | none | the reveal boundary being enforced in SQL |
| **5** | Historical player depth — full prior-season backfill | **expensive** | only if 0–4 prove out |

Phase 0 ships a complete, differentiated, zero-cost feature that nobody else has, and it is the half
the paywall question actually turns on. Phase 5 is the only line item that needs a budget
conversation, and it is last for that reason.

---

## Open questions

1. **How many seasons are in production?** (§2.1c) Unverified — needs one query. Decides whether
   phase 2 is a cache or a backfill.
2. **Paywall shape** — is the pool-level unlock acceptable, or is per-user tiering wanted despite
   the fairness cost? (§7)
3. **Does the crowd layer go platform-wide only**, as §3 layer 4 argues, or is there an appetite for
   an in-pool version *after* reveal?
4. **Is pick timing genuinely out?** (§4.7) It is the one stat with real competitive value that the
   disclosure gate rejects, and the call is Ryan's, not mine.
