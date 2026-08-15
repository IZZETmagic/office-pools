# League tournament structure — plan

> **Status:** draft for Ryan, 2026-08-15. Nothing to be built until §5 is answered.
>
> **Supersedes** `drafts/2026-08-14_league_platform_plan.md` §3.3, which said *"The July draft asked
> which engine hosts league scoring and recommended SQL-only. I agree"* and then did something the
> July draft did not ask for. That paragraph is where this went wrong; this document quotes the
> recorded decisions instead of restating them.

---

## 1. What was already decided

Not paraphrased. These are the source of truth and the plan is measured against them.

**`drafts/2026-07-30_league_path_plan.md` §3 — the engine:**

> "A new mode calculator alongside the existing three… a league adds `calculateLeague`. **Flat
> prices, no multiplier, no gate**, grouped by `round_number`."
>
> "**Register:** add a League row to the engine register in `SPORTPOOL_PROGRAMME.md` — the rule says
> add a row when you add an engine."

**Same document, §1 — the premise:**

> "A league pool never enters bracket code. Not guarded, not filtered — it takes a different path
> from the dispatch point onward." … "**the bracket engine is not touched.**"

**`SPORTPOOL_VISION.md` §6.3 / Decision 3 — the scoring methodology:**

> "A format is a named preset that **carries its own scoring** — the admin chooses a game, never
> assembles one."

**Decision 9 — the range those presets span:** three modes (Pick'em, Showdown, Last Man Standing),
a Results/Scores depth on the first two, Final Table as an add-on any mode can carry.

**Decision 3 — the create flow:**

> "**Crew selection lives on the name screen:** *Name · Crew · Who can join · Create*. 'No crew' is
> valid → share-link path, then *'save these people as a crew?'*."
>
> Format screen: recommended format pre-selected, primary button names it, **skipped entirely when
> only one format exists** and by Run it back, shows crew history.

**Decision 1 — what a pool is:** a Crew is permanent; **a pool is one crew playing one competition**
and archives. Captain owns people, a pool admin owns one season.

**The programme's own sequencing:** *Multi-sport: data model abstraction* — *"competition-instance
model (foundational for multi-sport). Everything else depends on it."*

---

## 2. Why the World Cup structure cannot host a league

| | World Cup | League |
|---|---|---|
| Shape | 12 groups → knockout bracket | every club plays every other twice, home and away |
| Fixtures known | group stage up front; knockout as placeholders | **all 380 known the day the season is published** |
| Progression | winners advance; placeholders resolve | **nothing resolves** — the table is a consequence, not a structure |
| Rounds | 7 named stages | 34 / 38 / 46 matchweeks, count varies by club count |
| Ends with | one champion, decided by a final | a table, decided by accumulated points |
| Participants | 48 national teams, drawn into groups | 18–24 clubs, no groups |

These are not variations on a theme. Almost every noun differs.

---

## 3. What is actually in production right now

I built the league by extending the World Cup's structure rather than creating a new one. The full
extent, so the decision in §5 is made against facts:

| World Cup object | What was done to it |
|---|---|
| `matches_stage_check` | widened to admit `regular_season` |
| `matches` | gained `round_number`, `round_label` — league columns on the bracket's fixture table |
| `pools_prediction_mode_check` | widened to admit `league_pickem` |
| `tournaments` | gained `format`, `external_provider`, `external_league_id`, `external_season` |
| `enforce_prediction_before_kickoff` | shared trigger, now carries a league branch |
| `shadow_score_match`, `shadow_eligible_entries`, `shadow_finalize_totals`, `shadow_calculate_bonuses` | the live World Cup scoring functions, now carrying league predicates |
| `pool_settings.group_*` | World Cup group prices reused as the league's flat tier |
| `pool_round_states.round_key` | bracket keys and `mw_1…mw_38` sharing one column |
| `teams` | clubs stored in `country_name`; `country_code` holds a 3-char club code |
| `predictions` | league picks in the same table, keyed to `matches.match_id` |

Plus, on the surface: the create-pool wizard gained a fourth mode card — which is the *"admin
assembles a game"* shape Decision 3 explicitly rejects — and `app/competitions.ts` says the Premier
League is taking pools.

**Separately, and unrelated to the league:** migration **046d** and the R20 re-score corrected a real
pre-existing World Cup bug (shadow double-counting the knockout base since 042). Ryan chose to keep
those. They belong to the World Cup track and should be recorded there, not here.

---

## 4. The structural options

This is the decision the whole plan hangs on. Presented with trade-offs rather than a single
recommendation, because picking it unilaterally is the mistake that produced §3.

### Option A — Leagues get their own everything

New `league_*` tables for competition, clubs, fixtures **and predictions**. The World Cup schema is
frozen byte-for-byte; the CHECK widenings and added columns are reverted.

- ✅ Literally "no holes in the World Cup structure". The strongest possible reading of the constraint.
- ✅ League tables can be named for what they are — `clubs.name`, not `teams.country_name`.
- ❌ Forks everything downstream of a prediction: scoring, leaderboard reads, analytics, XP, badges,
  banter share-cards. Two of each, forever, or until a third sport forces a merge anyway.
- ❌ The anti-fork warning in the July plan — *"writing the league engine in Node and in shadow SQL
  would recreate the exact hand-fork that made prod↔shadow parity worthless"* — applies to data
  models too.

### Option B — New competition layer, shared people layer

New `league_*` tables for **competition, clubs and fixtures**. `pools`, `pool_members`,
`pool_entries` and `predictions` stay shared, because they are about *people and their picks* and
contain nothing bracket-shaped. `predictions` gains a way to reference a league fixture.

- ✅ The genuinely format-specific things get their own structure; the genuinely generic things stay
  in one place.
- ✅ One leaderboard, one XP system, one banter layer.
- ❌ `predictions.match_id` currently FKs to `matches`. Pointing it at either table means **touching
  the World Cup's prediction table** — a hole, just a smaller and more deliberate one.
- ❌ "Shared but not really" is how the current mess started.

### Option C — The competition-instance model the programme already calls foundational

One `competitions` + `fixtures` layer that *both* formats sit inside, with the World Cup migrated
into it.

- ✅ The end state the programme already committed to. No second-class format.
- ✅ Sport #3 costs a row, not a rebuild.
- ❌ Touches the World Cup **deliberately and substantially**, including migrating 623 live pools and
  286,876 score rows. The programme calls this *"the biggest unknown in the project"*.
- ❌ Longest path to a working Premier League pool.

---

## 5. What I need from you

1. **A, B or C** — and if B, whether the `predictions` change is an acceptable deliberate hole.
2. **Where do format presets live?** Decision 3 says a format carries its own scoring. Today prices
   are per-pool rows in `pool_settings`. A preset implies a *named, versioned* definition the pool
   references. Is that a new table, or presets that stamp values into `pool_settings` at creation?
3. **Does the Crew flow come with this or after it?** Decision 3's screen assumes formats-as-presets,
   which assumes the answer to (1). Building the wizard twice is waste; building it late means the
   league ships on the wizard shape Decision 3 rejects.

---

## 6. Recommended immediately, independent of the above

The Premier League is currently reachable on production, running on World Cup furniture that at
least two of the three options replace. Someone creating a real pool on it now creates a migration
problem later.

**Take it back off the surface**, without deleting anything:

- revert the wizard's league mode card and the tournament filter to their pre-Phase-4 state;
- set `app/competitions.ts` Premier League back to "Coming soon";
- leave the imported season, the `tournaments` row and all migrations in place — they cost nothing
  dormant and the fixtures are correct.

That is a small, reversible change that buys the time to do §5 properly. It needs a deploy.

---

## 7. What this plan does NOT change

- **046d and the R20 re-score stay.** They fixed a real World Cup bug and are Ryan's decision,
  already taken. They get their own entry on the World Cup track.
- **Phase 0's dispatch fix stays.** `advancementTriggerFor` is logic-identical for every World Cup
  stage and is the guard that stops *any* future non-bracket fixture reaching the cascade. It is
  correct under all three options.
- **The importer stays.** It reads a season from api-football into whatever structure it is pointed
  at; only its destination changes.
