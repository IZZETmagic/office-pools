# NHL — competition research, and the pool modes it actually supports

> **Status: RESEARCH, 2026-09-02. Nothing here is decided and no code was written.**
> It exists to answer one question — *what does a hockey pool look like on this platform* — before
> anyone builds a migration. Where I state a fact about the NHL it is sourced (§12). Where I state a
> number about *us* it was read out of this repo today. Where I am estimating, it says so.
>
> Read §4 first if you read only one section. **Every other decision in this document falls out of the
> rhythm decision**, and the rhythm decision is the one thing hockey does not give us for free.

---

## 0 · The short version

| | |
|---|---|
| **The good news** | Hockey's three-way *regulation-time* market — home wins in 60 / tied after 60 / away wins in 60 — has almost the same shape as football's H/D/A (≈41 / 25 / 34 vs ≈45 / 25 / 30). `league_predictions.predicted_outcome` already stores exactly those three values. Results depth transfers **without a schema change to the pick**. |
| **The design problem** | There is no matchweek. 1,344 games across ~28 weeks, six nights a week, ~50 games a week, teams on unsynchronised schedules. Our entire engine — locks, snapshots, duels, LMS rounds, arrows, outbox — is matchweek-shaped. |
| **The answer to it** | **The Saturday slate.** ~13 games, ~26–28 of them in a season ⇒ **~340 fixtures picked, against the Premier League's 380.** An NHL season becomes the same size of ask as an EPL season. It is also what every incumbent hockey pool already does, so it needs no explaining. |
| **The blocker nobody would predict** | `league_seasons.club_count CHECK (club_count BETWEEN 4 AND 30)`. **The NHL has 32 teams.** An NHL season cannot be inserted today. |
| **The silent-wrongness risk** | `league_default_bands()` decides the scoring bands by grepping the standings feed for `'%relegation%'` and `'%champions league%'`. Hockey has neither. **Both of its two branches are wrong for the NHL and neither raises an error** — see §3.3. This is the exact defect class §2 of the vision calls not shippable. |
| **The realistic launch** | **The 2027 Stanley Cup Playoffs (April 2027).** Two months, 16 teams, a fixed bracket, no matchweek to synthesise, and it is the format hockey fans already know. The 2026-27 regular season starts **in 27 days** and is not reachable. |
| **The thing we've decided not to sell** | The single most popular hockey office pool in North America is the **draft pool** — pick skaters, accumulate their points. Vision §5 refuses fantasy depth by name. That is a real market cost and it should be a stated decision, not a silent omission. |

---

## 1 · The NHL as a competition — verified 2026-09-02

### 1.1 The 2026-27 season, specifically

| | |
|---|---|
| Teams | **32**, in 2 conferences × 2 divisions of 8 (Eastern: Atlantic, Metropolitan · Western: Central, Pacific) |
| Games | **84 per team — 1,344 in total**, an all-time high. First 84-game season since 1993-94; it is the first season of the new CBA (16 Sept 2026 → 15 Sept 2030), which added two divisional games per team |
| Regular season | **29 Sept 2026 → 10 Apr 2027** (~27.5 weeks). All 32 teams play on the final day |
| Nightly volume | Saturday averages **~13 games**; Tuesday and Thursday ~9–10; Monday, Wednesday, Friday, Sunday ~5 each |
| Breaks | A league-wide **holiday break** in late December, and an **All-Star break 4–7 Feb 2027** (the game returns; All-Star Weekend at UBS Arena, 5–6 Feb). Every team also takes a scattered 9–12 day bye between late January and mid-February |
| Set-pieces | Heritage Classic 25 Oct 2026 (WPG–MTL) · Winter Classic **31 Dec 2026** (COL–UTA, Salt Lake City) · Stadium Series 20 Feb 2027 (DAL–VGK, Arlington) |
| Playoffs | Mid-April → mid-June 2027 |
| Expansion | Not a 2026-27 concern. Houston/Austin is projected at **2029-30** at the earliest, with a 34th team (Atlanta or Phoenix) behind it. Plan for 32; do not hardcode it |

### 1.2 How a team earns a place — and why this matters to us

- **A win is 2 points, an overtime or shootout loss is 1, a regulation loss is 0.** There are no ties: every game produces a winner, in regulation, in 3-on-3 overtime, or in a shootout.
- **The league itself pays for a near-miss.** That is not trivia — it is the single most useful thing hockey gives a prediction product, and §7 builds on it twice.
- Standings tiebreakers, in order: points percentage → **regulation wins (RW)** → regulation-plus-overtime wins (ROW) → total wins → head-to-head points.
- **There is no single table.** There are four divisions, two conference races, and one overall league standing. The thing fans actually argue about is **the playoff cut line** — top 3 per division plus 2 wild cards per conference.
- **There is no relegation.** The bottom of the standings leads to a draft lottery, not a drop.

### 1.3 The playoffs

- 16 teams, 8 per conference: **top 3 in each division + 2 wild cards**.
- Four rounds, **best-of-seven**. The top division winner in each conference plays the second wild card; the other division winner plays the first wild card; 2nd and 3rd in each division meet.
- **The bracket is fixed and is not re-seeded between rounds.** This is what makes a fill-it-in-advance bracket possible at all — and it is the format's loudest criticism, which is itself banter fuel.
- The NHL's own Bracket Challenge scores **10 / 25 / 50 / 100** per correct series winner by round, plus **3 points for correctly calling how many games a first-round series goes**.

### 1.4 The calendar's shape — this is the design problem, stated plainly

A Premier League club plays once a week, and all twenty play the same weekend. That coincidence is
what a "matchweek" *is*, and our entire engine is built on it.

Hockey has no such coincidence. A team plays **~3 games a week** on a schedule unsynchronised with
every other team's. On a given Tuesday, nine teams are playing and twenty-three are not. There is no
week in which all 32 teams have played the same number of games. **Any "round" in an NHL pool is
something we impose, not something the sport hands us** — and gate 5 (variance provenance) makes that
worth saying out loud: imposing a *round boundary* is fine, because it adds no uncertainty. Imposing
which *games count* would be an editorial act, and needs a mechanical, disclosed rule.

---

## 2 · Five ways the NHL is not the Premier League

**1 · There are no draws — but there is a three-way market anyway.**
Every game has a winner, so a straight `home | draw | away` pick collapses to a coin flip. But hockey
has a second, earlier result: **the score after 60 minutes**, which the league itself pays a point
for. Approximate distribution:

| | Home | Middle | Away |
|---|---|---|---|
| **NHL, regulation-time result** | wins in 60 ≈ **41%** | tied after 60 ≈ **25%** | wins in 60 ≈ **34%** |
| **EPL, full-time result** | home ≈ 45% | draw ≈ 25% | away ≈ 30% |

Derived from a ~54.2% overall home win rate and a ~23–27% rate of games going past regulation
(2025-26 ran hot at 27.3% through 425 games, the highest since 3-on-3 arrived in 2015-16; ~23–25% is
the safer planning figure). **Treat these as planning estimates, not measurements** — the honest
version is a season of `api-web.nhle.com` results counted directly, which is an afternoon's work and
should be done before any price is set.

*So what:* `predicted_outcome text CHECK (... IN ('home','draw','away'))` — migration 064 — takes
hockey unchanged. The middle cell means "tied after 60". Nothing about the pick shape, the RLS, the
lock trigger or the score rows has to change. **What changes is where the engine reads the result
from**, and that is §3.3's problem, not §3.1's.

**2 · There is no matchweek.** §1.4. This is the real work.

**3 · There is no table, and nothing gets relegated.** `league_standings` ingests a feed's own `rank`,
`points`, `goals_diff`, `won`, `drawn`, `lost` and a band `description`. Hockey has no `drawn` (it has
OTL, which is a *loss* that scores a point) and no relegation band. The competition's headline
question is binary and set-shaped — **who makes the 16** — not ordinal.

**4 · One season is two competitions.** Sept–April is a 1,344-game marathon. April–June is a 16-team,
four-round, best-of-seven bracket that is culturally the *main event*. They want different modes, and
the second one is much closer to what this platform already knows how to do.

**5 · Nothing in hockey is called what football calls it.** Fixture → game. Club → team. Kickoff →
puck drop. Matchweek → slate or week. Table → standings. Draw → does not exist. Goal difference →
goal differential, and it is a tiebreaker nobody quotes.

*So what:* **the NHL is the cheapest possible test of whether the per-competition vocabulary layer is
real**, because there is no shared word to hide behind. If NHL copy can be shipped without editing a
component, the multi-sport branding item is done. If it can't, we've learned that for the price of a
copy file rather than a second sport's backend.

---

## 3 · What our engine already does, and what would reject an NHL season today

Read out of this repo on 2026-09-02. There are **zero** occurrences of "NHL" or "hockey" in
`app/`, `lib/`, `mobile/` or the migrations — this is greenfield.

### 3.1 Carries over unchanged

| Thing | Why it survives contact with hockey |
|---|---|
| `league_predictions.predicted_outcome` (064) | `home / draw / away` = home in 60 / tied after 60 / away in 60 |
| `league_predictions` scoreline pair, `CHECK (0..20)` | Hockey scores are 2–5 a side. Fits with room |
| `league_fixtures` status enum | `scheduled / live / completed / postponed / cancelled` — all real in hockey |
| `league_clubs.abbreviation char(3)` UNIQUE per season | The NHL's own codes are three letters and unique: TOR, BOS, NYR, NYI, NJD, VGK |
| One-open-matchweek rule (058, 103) | A Saturday slate is a matchweek. One at a time, derived not stored |
| The empty-matchweek work (094, 106) | **Load-bearing here.** Hockey guarantees empty slates — All-Star Saturday, the holiday break. 106 already makes Showdown score an empty week 0-0 (a point each) and stops LMS eliminating the entire pool on a week nobody could pick in. The Premier League hits this once a season; **the NHL hits it two or three times, on the calendar, predictably** |
| Deadline machinery (101, 105, Decision 10) | "Locks one hour before the round's first puck drop" is the same sentence |
| Rescheduling / re-homing (L11, 100–106) | Hockey postpones for weather and building conflicts; a moved game must be picked in the slate it is *played* in |
| Showdown as a layer (083–085) | It reads one number — the entry's points for the round. It does not care what sport produced it |
| LMS club-once-per-round + must-be-playing (086–088, 103) | Both rules get *more* useful with 32 teams and ~26 playing on a given Saturday |

### 3.2 Would reject an NHL season outright

These are hard stops, not opinions:

```
league_seasons_clubs_ck   CHECK (club_count      BETWEEN 4 AND 30)   -- NHL: 32.  ❌
league_seasons_mw_ck      CHECK (matchweek_count BETWEEN 1 AND 60)   -- Saturdays: ~28 ✅ / nightly: ~180 ❌
league_seasons.country_code char(3)                                  -- NHL is USA + CAN
```

`club_count BETWEEN 4 AND 30` is the whole finding: **the first NHL migration is a one-line
constraint change**, and it is worth knowing that before someone spends a day on an importer. The
`matchweek_count` ceiling of 60 is the second, quieter one — it silently rules out any per-night
rhythm, which §4 rejects on other grounds anyway. Nice when a constraint agrees with the design.

### 3.3 Would score silently wrong — the dangerous list

| Where | What happens | Why it's the bad class |
|---|---|---|
| **`league_default_bands()`** (089–093) | **Both branches fail, differently** — read in full today. It branches on whether the feed supplied *any* `description`, then counts `'%champions league%'` and `'%relegation%'`. **(a) Feed supplies descriptions** (e.g. "Stanley Cup Playoffs", "Wild Card"): both counts are 0 ⇒ `top_n = 0`, `relegation_n = 0` ⇒ **every band bonus pays nothing**, and a member who correctly called the playoff field scores 0 for it. **(b) Feed supplies none**: the proportional fallback gives `top_n = ROUND(32 × 0.20) = 6` and `relegation_n = ROUND(32 × 0.15) = 5` ⇒ **five relegation places in a league with none**, paid for | Neither branch errors. One pays nothing, one pays for something imaginary, and which one fires depends on a feed field nobody has looked at yet. Silent wrongness — vision §2 |
| **The regulation result** | `league_fixtures` stores `home_goals` / `away_goals` **only at full time**. There is nowhere to record that a 3-2 was 2-2 after 60 | Every "tied after 60" pick would score as a loss and every regulation-win pick would score as a win. The pick shape survives; **the result shape does not** |
| **`league_standings.drawn`** | `NOT NULL`. The obvious move is to shove OTL into it | An OTL is a *loss worth a point*. Filling `drawn` with it makes W-D-L read wrong on every screen and makes any derived points total wrong |
| **`league_score_fixture` winner logic** | Resolves winner-vs-winner off final goals | Correct for Scores depth. Wrong for a regulation-time Results pick, for the same reason as row 2 |

**The minimum honest schema addition is one column**, not a table:
`league_fixtures.decided_in text CHECK (decided_in IN ('regulation','overtime','shootout'))`, plus
either `home_goals_reg` / `away_goals_reg` or the convention that a `decided_in <> 'regulation'` game
was level at 60 and the winner scored the last goal (which is true by definition). One column is
enough to derive the three-way outcome, and per the `entry_xp_state` lesson **it ships before any code
names it**.

### 3.4 The data feed

`lib/integrations/apiFootball/` is eleven files and a test directory, and api-football is soccer only.
Two candidates:

| | **`api-web.nhle.com`** (the NHL's own) | **API-Sports `v1.hockey`** |
|---|---|---|
| Cost / key | **Free, no API key** | Paid plans; free tier 100 req/day |
| Coverage | Schedule, scores, standings, rosters, play-by-play, gamecenter | 245+ hockey leagues incl. NHL, KHL, SHL, AHL, IIHF |
| Shape | Undocumented-but-stable public endpoints (`/v1/standings/now`, `/v1/score/now`); community reference docs exist | Same vendor family and **the same response idioms as api-football** |
| Risk | Unofficial contract; can change without notice | A second bill; NHL depth is shallower than the league's own |

`league_seasons.external_provider` already exists with `DEFAULT 'api_football'`, so a second provider
was anticipated. **Recommendation: API-Sports hockey for the ingestion path** (the mapper layer is the
expensive part and it would be built against familiar shapes), **with `api-web.nhle.com` as the
cross-check** — which is exactly the role migration 076 already plays for the Premier League table.
The NHL feed being free makes a second opinion nearly costless, and a second opinion is what turns
"the standings are wrong" from a support ticket into an alarm.

---

## 4 · The rhythm decision — everything else follows from it

| | **A · The Saturday slate** ⭐ | **B · Calendar week, every game** | **C · Every game night** |
|---|---|---|---|
| A round is | Saturday's games | Mon–Sun | One night |
| Rounds/season | **~26–28** | ~27 | **~180** |
| Picks/round | **~13** | ~50 | ~5–13 |
| Picks/season | **~340** | ~1,340 | ~1,340 |
| vs the EPL's 380 | **Dead level** | 3.5× | 3.5× |
| `matchweek_count ≤ 60` | ✅ | ✅ | ❌ rejected by the schema |
| Precedent | **The incumbent convention** — the leading office-pool products run hockey pick'em *and* survivor on Saturdays | — | — |
| Cost | The pool is quiet Sun–Fri | Homework; nobody finishes a 50-game slate in November | 180 deadlines, 180 notification cycles |

**Recommend A, and use it for every matchweek mode** — Pick'em, Showdown and LMS on one rhythm, so
"exactly one matchweek is open" stays exactly one thing.

Three things make Saturday more than a convenience:

1. **It is already the ritual.** Hockey Night in Canada is Saturday; the incumbent pool products
   default to Saturday. We would be adopting a convention, not teaching one.
2. **It sizes the season correctly.** ~340 picks is a Premier League season. Decision 9's homework
   argument — *"a month of World Cup scorelines is a burst; ten months of them is homework"* — is
   satisfied by arithmetic rather than by hoping.
3. **It costs nothing in variance provenance.** We choose *when the round is*, not what happens in it.
   The rule is mechanical and one sentence: **the round is Saturday's games**.

**The honest cost, and its answer.** The pool goes quiet on five of six game nights, and the leaderboard
only moves on Saturdays — which sits awkwardly beside vision §3, *the standings move when the goal goes
in.* The answer is not to add a mode; it is that **hockey makes the season-long standings prediction
load-bearing rather than decorative**. A playoff-race prediction (§6.4) moves on a Tuesday in
November — the NHL plays six nights a week, so it moves nearly every night. In the Premier League the
table only moves at weekends anyway, which is why Decision 9 could treat Final Table as an add-on. In
hockey it is the thing that keeps the pool alive between Saturdays. **That inverts its priority: for
the NHL, the standings mode is not optional.**

---

## 5 · The proposed mode grid

Stated in Decision 9's vocabulary, so it can be compared to the EPL grid line for line.

| | **Results** (three-way, regulation time) | **Scores** (exact goals) |
|---|---|---|
| **Pick'em** — Saturday slate, running season table | ✅ **default and recommended** | ⚠ available, not recommended (§7.2) |
| **Showdown** — weekly H2H duels over the slate | ✅ | ⚠ same caveat |
| **Last Man Standing** — one team a Saturday | — its own pick shape, no depth axis | — |
| **Standings** (`table` mode, NHL copy) — the playoff race | — no depth axis; two profiles: `playoff_field` ⭐ / `full_divisions` | — |
| **Two Points** — back one team a Saturday, bank what they bank | — its own pick shape. **New mechanic; gates run in §6.5** | — |
| **The Bracket** — playoffs only, series by series | — its own pick shape | — |

Four of these six are the modes we already have, with a different result-derivation and different
copy. **Two Points and The Bracket are new**, and only The Bracket is needed for a first NHL launch.

---

## 6 · The modes, one by one

### 6.1 Pick'em — the Saturday slate

**The pick.** For each of Saturday's ~13 games: *home wins in 60 · goes past 60 · away wins in 60*.

**The tooltip.** *"Call each game at the end of 60 minutes. If you think it's going to overtime, say
so."*

**Lock.** One hour before the slate's first puck drop, for everyone at once (Decision 10, unchanged).
⚠ A Saturday slate spans from ~1pm ET matinées to a 10pm PT start — **nine hours**. A per-game rolling
deadline (which the incumbents use) would let a late picker watch the afternoon games first. Decision
10 already answers this: one deadline for the whole round, because a later pick is insider
information. Keep it, and expect it to be the most-questioned rule in the mode.

**Scoring.** §7.1.

**Why not just "who wins".** A binary pick is not statistically flat — a 60% picker separates from a
54% one over ~340 games — but it is **socially** flat, and that is the one that matters here. If the
whole pool backs the same nine favourites, there is nothing to say to each other on Sunday morning.
The overtime cell manufactures disagreement out of the sport's own uncertainty, which is exactly what
the draw does for football and exactly what gate 5 permits.

### 6.2 Showdown — unchanged

A layer over the slate's accuracy number, 3 / 1 / 0, published round-robin draw revealed weekly
(Ryan's 2026-08-30 call). It reads `SUM(league_match_scores.total_points)` for the round and does not
know what sport made it. **No hockey-specific work at all**, beyond the empty-slate case that 106
already handles (0-0, a point each — which is the honest answer for a week with no games).

With ~26 rounds a round-robin repeats roughly four times in a pool of eight, versus three times over
the EPL's 38. Immaterial.

### 6.3 Last Man Standing — and hockey makes it simpler

**The pick.** One team from Saturday's slate. They must win. Each team once per round.

**Decision 13 needs no amendment — hockey deletes its only awkward case.** The rule is *"only a WIN
keeps you in; a draw is OUT; no fixture = IN."* Hockey has no draws, so the clause that has to be
explained never fires. The tooltip becomes one line: *"Your team has to win. Overtime counts."*

Three hockey-specific notes:

- **An OT/SO win survives.** The league calls it a win and the standings call it a win. Do not invent
  a distinction the sport does not make. (An OT *loss* is out — it is a loss.)
- **The "must be playing" guard (103) does much more work here.** Only ~26 of 32 teams play a given
  Saturday, versus 20 of 20 in a normal EPL matchweek. The grey-out-and-say-why UI is not an edge case
  in hockey; it is most of the screen's job.
- **Rounds can run longer.** 32 teams once each is a 32-round ceiling against a ~26-Saturday season, so
  in principle a round need never end. In practice, at ~65% survival a pool of eight is down to one in
  five or six rounds, same as football. Worth a look at the "season ends mid-round" case, which the
  EPL build has not had to face.

### 6.4 Standings — the playoff race (`table` mode, two profiles)

**Promoted from optional to essential** by §4's quiet-week problem.

| Profile | The ask | Why |
|---|---|---|
| **`playoff_field`** ⭐ default | Tick the **16 teams** that make the playoffs — 8 per conference. Optionally: the 4 division winners, and the Cup winner | One decision before opening night. It is *the* October argument. Scored as a **set**, which is what `headline_only` already does. Live against the real cut line every night from week three |
| **`full_divisions`** | Order all 8 teams in each of the 4 divisions | The true analogue of Full Table — and **better than the EPL version**, because four lists of eight is a comprehensible ask where one list of twenty is not. Stores 32 positions; the distance-decayed positional term applies within a division |

**What must be rebuilt, not reused:** `league_default_bands()` (§3.3). The NHL's bands are *playoff
spot / wild card / eliminated*, and the function has to learn to recognise them — never a percentage
of the field, which in a 32-team league invents a five-team relegation zone. Until that is explicit,
an NHL table pool either pays nothing for the one prediction the mode is about, or pays for a band
that does not exist. **The first thing to look at is whether the hockey feed populates `description`
at all**, because that single field decides which of the two failures we get.

**What is reused verbatim:** `league_standings_final` and the season-end snapshot. It is load-bearing
for the same reason as in football — `league_standings` is upserted current state, so without freezing
it a feed correction silently restates an award already paid.

### 6.5 Two Points — the NHL-native mode (new mechanic)

**The pick.** Each Saturday, back one team. **You bank the points that team banks**: 2 for a win, 1
for an overtime or shootout loss, 0 for a regulation loss. Each team can be used **once per season**.
Your total is displayed as a standings row, because that is what it is.

**Why it is worth proposing.** Every element of it is the league's own currency. There is nothing to
teach: any hockey fan already knows what 2 and 1 and 0 mean, and the "loser point" — the most-argued
rule in the sport — becomes the mechanic that keeps a bad pick from being a wasted week. The
once-per-season constraint (already built for LMS) turns it into a season-long allocation game: you
are *saving* Colorado for a good matchup, and that is a thing to say to people in December.

**The five gates:**

1. **Disclosure** — *"Back one team each Saturday. You get the points they get. Each team once a
   season."* Three sentences, no jargon. ✅
2. **Affect** — anticipation and pride ("I had Montreal in November"). No guilt, no obligation: a
   missed week costs points you never had, not a life. ✅
3. **Symmetry** — identical to every other mode; leaving costs nothing and is one tap. ✅
4. **Substitution** — the counter-metric is **picks per member per round must stay at 1**. If members
   start needing a spreadsheet of who they've spent, it has become fantasy and has failed. ✅ with a
   named tripwire
5. **Variance provenance** — all uncertainty is the NHL's. The only thing we add is a deterministic,
   disclosed constraint. ✅

**The honest problem, which is why I would not launch with it.** One pick a week is **1/13th the
sample of Pick'em**, so luck weighs about 3.6× more. Rough numbers over ~26 rounds: a good picker
banks ~36 points, a coin-flipper ~29, and the noise on that difference is a standard deviation of
~4.8. It separates, but not cleanly, and *"I lost because my one pick lost"* is closer to bad feelings
than *"I lost because I called nine of thirteen"*. Fixes, in order of preference:

- Run it as a **companion / side award** alongside a Pick'em pool rather than as the pool's table.
- Or three picks a Saturday, each team at most three times a season — triples the sample, at the cost
  of a constraint that takes a sentence longer to explain.

**Recommendation: design it now, ship it in a second NHL season, once we know what real hockey pools
do with the modes we already have.**

### 6.6 The Bracket — the Stanley Cup Playoffs

**The flagship, and the realistic first NHL product.** Two months, 16 teams, ~85 games, four rounds of
best-of-seven, and a format every hockey fan has already filled in.

**Two shapes, and we have opinions about both from the World Cup:**

| | **Locked bracket** (the NHL's own) | **Progressive, round by round** ⭐ |
|---|---|---|
| Pick | All 15 series before round 1 | Each round's series as they are set |
| Prices | 10 / 25 / 50 / 100 by round, +3 for calling a first-round series length | Same escalation, priced per round |
| The problem | A bracket that busts in round 1 leaves that member dead for six weeks | Everybody is alive in every round |
| Our history | `full_tournament` | `progressive` — and the progressive round-open playbook already exists |

**Recommend progressive, with an optional locked Cup pick made before round 1 for a bonus** — that
keeps the one prediction people actually want to be held to, and drops the one that kills a member's
May. This is the same trade the World Cup build already made, for the same "no bad feelings" reason.

**The hockey-native extra dimension is series length.** *"Toronto in 6."* It is how hockey fans
actually talk, the NHL's own bracket challenge pays for it, and — like the overtime cell — it is
uncertainty the sport already produces. Suggested shape:

| | Points |
|---|---|
| Series winner, right | 100 × round multiplier (1 / 2.5 / 5 / 10, mirroring 10/25/50/100) |
| Winner right **and** length right ("in 6") | +50% |
| Winner wrong | 0 — including if you called the length right, because you called the wrong team |

**What it needs that does not exist:** a **series** object. `league_fixtures` knows about games, not
about a best-of-seven that is scored on aggregate and can end after four. That is the one genuinely
new structure in this document — roughly `league_series (round, high_seed, low_seed, wins_high,
wins_low, winner_club_id, games_played, is_completed)`, with games hanging off it. It is also the
piece most likely to be reusable later: **a best-of-N series is the shape of every playoff in North
American sport**, which is the NBA and MLB in one abstraction.

---

## 7 · Scoring, in detail

### 7.1 The three-way regulation ladder

Pick ∈ {Home in 60, Past 60, Away in 60}. Outcome has four states, because a game that goes past 60
still has a winner:

| Pick ↓ / Outcome → | Home in reg | Home in OT/SO | Away in OT/SO | Away in reg |
|---|---|---|---|---|
| **Home in 60** | **100** | 50 | 0 | 0 |
| **Past 60** | 0 | **100** | **100** | 0 |
| **Away in 60** | 0 | 0 | 50 | **100** |

The 50 is the mechanic worth defending: **you had the right team, you were wrong about the manner —
and the league itself pays a point for exactly that distinction.** The tooltip writes itself: *"You
called Toronto in regulation. They won in overtime — half points, the same way the NHL gives the
losing team a point."*

**The price asymmetry, stated rather than hidden.** At the base rates in §2, expected value per game
is ~47.5 for a home-in-60 call, ~40 for away-in-60, and **~25 for the overtime call**. So overtime is
structurally the contrarian pick, under-priced relative to how often it lands.

That is not a defect to patch — **it is exactly the football draw**, which our Results ladder also
pays flat at `group_correct_result`, and which has always been the pick that separates a table. Ship
flat for launch. **If a season's data shows the overtime cell is never picked, the honest lever is a
higher published price for it** — a number in the scoring config that a member can read — never a
hidden multiplier and never a random one.

**Mapping onto what exists.** Results depth today prices at `group_exact_score` (default 100) for a
correct outcome and 0 otherwise — a two-rung ladder. Hockey wants three rungs (100 / 50 / 0), so this
is a *third* `score_type` alongside `exact` / `winner_gd` / `winner`, not a new engine. Working name:
`right_team_wrong_clock`. It slots into the same `CASE` in `league_score_fixture`.

⚠ **`exact_count` goes inert in Results depth** and the cascade quietly drops to four rungs — Decision
9 already says so for football, and it is true here for the same reason.

### 7.2 Why Scores depth is worse in hockey than in football

Decision 9 rejected Scores as an EPL default at 760 numeric decisions. On the Saturday slate hockey is
~680 — no better. But there are two hockey-specific reasons to go further and **not offer it at
launch**:

1. **The exact-score hit rate is lower.** Football concentrates on 1-0, 2-1, 1-1 and 0-0. Hockey
   spreads across 3-2, 4-1, 2-1, 5-2, 4-3 with a much flatter distribution, so an exact call is closer
   to a lottery ticket. More noise in the table is a direct hit to *"nobody finishes feeling
   cheated"*.
2. **The exact score can't be reconciled with regulation time without a second question.** Is a 4-3
   OT win an "exact" 4-3? The goal was scored in overtime. Either the mode asks for the regulation
   score (unnatural — nobody says "it'll be 2-2 after 60") or it asks for the final score and quietly
   contradicts the mode next door. Two modes disagreeing about what the result *is* is the class of
   bug this repo has paid for twice.

**Recommendation: NHL launches Results-only.** Keep the depth column; leave the Scores cell empty and
say why in the wizard.

### 7.3 Tiebreaks

The canonical cascade holds: `total_points DESC, exact_count DESC, correct_count DESC, bonus_points
DESC, predictions_submitted_at ASC NULLS LAST`. With `exact_count` inert, hockey runs the same
four-rung version as EPL Results depth, and the standings prediction (§6.4) drops into `bonus_points`
exactly as Final Table does — **so rung 4 comes free again, and no new tiebreak code is needed.**

There is a tempting hockey-flavoured tiebreak: **regulation wins called correctly**, mirroring the
NHL's own first tiebreaker. It is cute, it is thematic, and it would be a fifth definition of "a
point" living outside the register. **Don't**, unless a real tie is observed.

---

## 8 · What we should not build, and why

Stated because these are the *popular* formats, and omitting them silently would look like an
oversight rather than a decision.

| Format | What it is | Ruling |
|---|---|---|
| **The draft pool** — the classic Canadian "hockey pool" | Draft skaters and goalies, accumulate their points all season | ❌ **Vision §5 refuses "fantasy-depth obsessives — season-long roster management, transfers, waivers, trades"** by name. This is the single most common hockey office pool in North America, so this refusal has a real market cost. **It should be re-affirmed by Ryan for hockey specifically**, not inherited quietly from a football-era decision |
| **Squares / box pool** | A grid of digits, numbers drawn at random, payouts by period score | ❌ **Gate 5, outright.** The randomness is entirely ours — the sport contributes only the digits. It is also structurally a raffle |
| **Player props** — first goal scorer, shutout, hat-trick | Pick individual player outcomes per game | ❌ Fantasy depth by another route, and it points straight at a sportsbook's prop menu. §5 refuses bettors as an audience |
| **Against the spread / puck line** | Pick with a handicap | ❌ Sportsbook mechanics on a sportsbook's line. §5 |
| **Playoff player pool** | Draft 10 skaters for the playoffs, count points | ❌ Fantasy. Same ruling as the draft pool, and it is the *playoff* format we'd be competing with in April |

The pattern is worth naming: **hockey's pool culture is more fantasy-shaped and more gambling-shaped
than football's.** Our two most direct competitors for an NHL audience are formats we have already
refused. The modes in §5–6 are the honest, disclosed subset — the question for Ryan is whether that
subset is enough to be interesting to a hockey crowd, and it is a genuine strategic question rather
than a rhetorical one.

---

## 9 · Sequencing — what the calendar actually allows

| Window | What is possible | Notes |
|---|---|---|
| **Now → 29 Sept 2026** | **Nothing.** 27 days | The Premier League build is not deployed: local `master` is **37 commits ahead of `origin/master`** as of today. Every league mode except Pick'em-at-Scores is running only on Ryan's machine. Starting a second sport before the first one is in front of members would be the wrong call, and it is not a close one |
| **Oct 2026 → Jan 2027** | Research, ingestion, the `decided_in` column, band rework, the constraint fix | Unglamorous and all of it is prerequisite. Roughly: a hockey provider adapter (the eleven-file `apiFootball/` shape), one schema migration, one bands function, one new `score_type` |
| **Jan 2027** | ⚠ *Possible* mid-season Saturday-slate pilot | A slate pool can start on any Saturday — unlike a standings prediction, which must lock before opening night. A half-season pilot with a friendly crew is the cheapest possible real test |
| **April 2027 → June 2027** | ⭐ **The launch: the Stanley Cup Playoffs** | Two months, bracket-shaped, no matchweek to synthesise, and it is the format hockey fans already fill in. It needs the series object (§6.6) and almost nothing else from §3 |
| **Sept 2027 →** | **The full NHL season**: Pick'em, Showdown, LMS, Standings on the Saturday slate, with a season of real data behind the prices | And a standings prediction that can lock before opening night, which is when it is worth the most |

**The strategic read.** The playoffs are not a consolation for missing the season — they are the
better first product. They are short enough to fail cheaply, culturally the main event, shaped like
the thing this platform has already shipped once, and they end in June, which leaves a clean run at
the September season with everything learned.

---

## 10 · Open questions for Ryan

1. **Does the fantasy refusal hold for hockey?** The draft pool is *the* hockey pool. Refusing it is
   defensible and consistent — but for football we were refusing a format most people don't play, and
   here we're refusing the format most people do. Worth an explicit yes.
2. **The overtime cell — in or out?** In gives hockey a real three-way and a reason for a pool to
   disagree. Out gives a simpler tooltip and a flatter, more agreeable pool. I recommend in.
3. **Saturday-only, or does the pool go quiet?** §4's cost is real. Accepting it means accepting that
   the standings mode is mandatory rather than optional for the NHL.
4. **Playoffs-first — agreed?** It reorders the multi-sport project around a two-month April event
   rather than a September season.
5. **One rhythm for every mode, or per-mode rhythms?** I recommend one (Saturday), to keep the
   one-open-matchweek invariant honest.
6. **Which feed pays the bill** — API-Sports for consistency, or the NHL's free API for cost, or both
   with one as the cross-check (recommended).

---

## 11 · What I did not verify, and what it would take

Kept separate from everything above on purpose.

- **The base rates in §2 are estimates**, derived from a ~54.2% home win rate (a betting-trends
  source, not the league) and a ~23–27% overtime rate. **Count them from a real season** via
  `api-web.nhle.com` before any price is set. An afternoon.
- **The Saturday count (~26–28) is arithmetic, not the published schedule.** The 2026-27 calendar is
  out; the exact number of playable Saturdays — net of the holiday break and All-Star Saturday, 6 Feb
  2027 — should be counted from the fixture list. It changes the season's size by up to two rounds.
- **The exact December break dates were not pinned down.** Sources conflict on the day the schedule
  resumes, so §1.1 deliberately says "late December" rather than a date.
- **No hockey feed was called.** Everything about response shapes in §3.4 is from documentation, not
  from a request. A one-hour spike against both feeds would settle the provider question properly.
- **Nothing here has been costed.** There are no effort figures in this document on purpose — sizing
  belongs with a plan, and there is no plan yet.

---

## 12 · Sources

**The competition**
- [NHL releases 2026-27 regular-season schedule — NHL.com](https://www.nhl.com/news/nhl-releases-2026-27-regular-season-schedule)
- [NHL releases expanded 84-game schedule for 2026-27 — ESPN](https://www.espn.com/nhl/story/_/id/49376073/nhl-releases-expanded-84-game-schedule-2026-27-season)
- [10 things to know about the 2026-27 regular season — NHL.com](https://www.nhl.com/news/nhl-stats-pack-2026-27-regular-season-schedule)
- [What you need to know about the new NHL CBA — NHL.com](https://www.nhl.com/sabres/news/nhl-new-collective-bargaining-agreement-details)
- [Playoff Format — NHL.com](https://www.nhl.com/info/standings-info/playoff-format)
- [Playoff Tie-Breaking Procedure — NHL.com](https://www.nhl.com/info/standings-info/tie-breaking-procedure)
- [NHL could see expansion team awarded before the end of the year — TSN](https://www.tsn.ca/nhl/article/nhl-could-see-expansion-team-awarded-to-houston-or-austin-before-the-end-of-the-year/)

**Base rates**
- [Why are so many NHL games going to overtime this season? — ESPN](https://www.espn.com/nhl/story/_/id/47210375/nhl-2025-26-games-shootout-theories-trends-stats-standings)
- [NHL Home vs. Away Betting Trends — BettorEdge](https://www.bettoredge.com/post/nhl-home-vs-away-betting-trends-2025) *(a betting-trends aggregator, not the league — treat as indicative)*

**Existing pool formats**
- [Stanley Cup Playoffs Bracket Challenge — how to play, NHL.com](https://bracketchallenge.nhl.com/en/how-to-play)
- [What is hockey pick'em? — OfficePools](https://www.officepools.com/help/article/hockey-pickem/)
- [What is hockey survivor? — OfficePools](https://www.officepools.com/help/article/hockey-survivor/)

**Data feeds**
- [NHL API Reference (unofficial) — Zmalski/NHL-API-Reference](https://github.com/Zmalski/NHL-API-Reference)
- [API-Sports Hockey documentation (v1)](https://api-sports.io/documentation/hockey/v1)

**This repo, read 2026-09-02** — `SPORTPOOL_VISION.md` §5 · §7 · `SPORTPOOL_PROGRAMME.md` Decisions
8, 9, 10, 13 and the scoring-engine register · `lib/migrations/050`, `064`, `066`, `075`, `077–088`,
`089`, `094`, `101–106`.
