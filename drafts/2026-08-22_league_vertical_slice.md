# Premier League — vertical slice

> **Written 2026-08-22 on Ryan's instruction**, replacing phases L4→L13 of
> `2026-08-22_premier_league_backend_design_v3_1.md` as the near-term plan.
>
> **Why.** The v3.1 plan puts UI at phase 13 of 16. We are on phase 4. On its own
> estimates that is ~30–35 working days before anyone sees a Premier League
> screen, because every phase between here and there protects the 623 live World
> Cup pools rather than moving the league forward. That caution was calibrated
> when leagues were being bolted *into* the World Cup schema. Since the
> 2026-08-15 split a league pool touches almost none of the World Cup's
> machinery — and the plan was never re-costed against the architecture the split
> bought.
>
> **Goal:** one Premier League pool a person can create, pick in, and see scored,
> on the web. Roughly **8–10 days** instead of 35.
>
> v3.1 is not discarded. Everything cut here is listed in §5 with the phase it
> returns in.

---

## 1. The decision that removes most of the work

**A league pool keeps a populated `tournament_id`. `league_season_id` is added
alongside it, nullable. No exactly-one CHECK, no `DROP NOT NULL`, in the slice.**

v3.1 makes `tournament_id` NULL for a league pool. That single choice is what
creates the phase's biggest cost: **50 sites read `pools.tournament_id`, and 34
of them are raw selects the compiler cannot catch** (measured 2026-08-22). Each
becomes `.eq('tournament_id', null)` → zero rows at HTTP 200 → silent wrongness,
which is exactly the failure class this codebase keeps hitting. v3.1's answer is
a `CompetitionRef` discriminated union and a hand-audited sweep of all 50.

Keeping `tournament_id` populated makes that entire sweep unnecessary for the
slice. Every existing World Cup path keeps working unchanged, because the value
is a real FK to a real row.

**This is not speculative — it is the state production has been in for a week.**
Pool `PTQPZ797` has `tournament_id = b1299174…` AND
`prediction_mode = 'league_pickem'`, and has caused no failure. The tournament it
points at has 0 `matches` and 0 `teams`, so every World-Cup-scoped query returns
empty for it, which is the correct answer for a pool that has no World Cup
fixtures.

**What it costs.** Two sources of competition truth coexist until the full L4
lands the XOR. That is a real invariant deferred, and it is written down here
rather than forgotten: §5 owns it.

---

## 2. Containment — what the slice actually needs

Of v3.1's seven sites, the slice needs **one**, and it is already shipped.

| Site | Slice disposition |
|---|---|
| `lite_recalc_entry` | ✅ **DONE — migration 054a.** Keyed on `prediction_mode`, so it works with or without `league_season_id`. Verified by execution against both a league and a World Cup entry |
| `shadow_score_match` | **not needed** — starts `FROM predictions`; league picks live in `league_predictions`, so it sees zero rows |
| `shadow_pools_needing_materialize` | **not needed** — same, starts `FROM predictions` |
| `shadow_calculate_bonuses` | **not needed for the slice** — its downstream joins key on `t.tournament_id` against `shadow_actual_standings` / `matches`, and the zombie tournament has no rows |
| `shadow_finalize_totals`, `shadow_reconcile_adjustments` | **not needed for the slice** — both reach an entry only via `has_submitted_predictions` or a non-zero `point_adjustment`; see the constraint below |
| `shadow_eligible_entries` | **not needed IF** the constraint below holds |
| `snapshot_pool_ranks` | **not needed for the slice** — the L3 league arm already `continue`s before the only caller that could reach it. Its real hazard (an admin route + `PUBLIC`/`anon` grants) is a security item, not a league item; §5 |

**THE ONE CONSTRAINT THIS RESTS ON, and it is load-bearing:**

> **The league write path must NOT set `pool_entries.has_submitted_predictions`,
> and must NOT write `pool_entries.point_adjustment`.**

Those two columns are the only doors by which a league entry can enter the World
Cup scoring selectors. Keep them untouched and containment is structural. Set
them and three selectors need conjuncts immediately.

League submission state belongs in `league_predictions` and
`league_entry_totals`, which is where the split put it. **Asserted as a test in
S2, not left as a note.**

---

## 3. The four steps

### S1 — a league pool can be created (1–2 days)

- **migration `054b_slice`**: `ALTER TABLE pools ADD COLUMN league_season_id uuid
  REFERENCES league_seasons(season_id)` + partial index. Additive only. No
  CHECKs, no `DROP NOT NULL`.
- **`app/api/pools/create/route.ts`**: accept an optional `league_season_id`;
  when present, resolve the competition's placeholder `tournament_id` server-side
  rather than trusting the client, and force `prediction_mode = 'league_pickem'`.
- **`components/pools/CreatePoolModal.tsx`**: put the Premier League back on the
  wizard. `isLeagueTournament` and the mode card already exist — they were left
  half-armed when the league was pulled.
- **do NOT** seed `pool_round_states`. `seedPoolRoundStates` already refuses for
  a league (P0 fix). Round state is derived in S2.

*Verify:* create a pool through the real wizard against production; assert one
`pools` row with both ids set, `prediction_mode='league_pickem'`, and **zero**
`pool_round_states` rows.

### S2 — the matchweek renders and takes picks (2–3 days)

- **`lib/league/fixtures.ts`** (new, small): given a pool and a matchweek, return
  its 10 fixtures already shaped as the existing `MatchData` the UI renders. This
  is the *only* piece of v3.1's 95-site repoint the slice needs.
- **`lib/league/rounds.ts`** (new): derive the matchweek list and lock state from
  `league_matchweeks` — `fixture_count`, `lock_at`, `completed_fixture_count`.
  No `pool_round_states`.
- **save path**: write `league_predictions`. The kickoff lock is already enforced
  by `enforce_league_prediction_before_lock` (L1) — a DB-level silent-skip, so
  the route must read back and report rather than assume success.
- **UI**: reuse the existing prediction screen against the mapped fixtures.

*Verify:* pick all 10 fixtures of an open matchweek; rows land in
`league_predictions`; a pick on a locked matchweek is refused; and
**`pool_entries.has_submitted_predictions` is still false for every league
entry** (the §2 constraint, asserted).

### S3 — it scores (2–3 days)

- **migration `055_slice`**: `league_score_matchweek(p_season_id, p_matchweek_id)`
  — exact / winner_gd / winner / miss into `league_match_scores`, summed into
  `league_entry_totals`. Flat prices, no multipliers, no bracket gate; the July
  plan settled that.
- called from the L3 sync arm when a fixture completes. The arm already knows
  which fixtures changed — that is what `changed` reports.

*Verify:* score a real completed matchweek; totals reconcile against a
hand-computed expectation for one entry; re-running is idempotent.

### S4 — a leaderboard (1–2 days)

- read `league_entry_totals`, reuse the existing leaderboard component.
- ranking derived in SQL, per the scoring architecture rule.

*Verify:* the leaderboard matches `league_entry_totals` ordering, and a member
sees their own points.

---

## 4. What this is not

Not production-ready for real customers. It is a working path end to end, on the
web, for one pool. The gap between this and "open the door" is §5.

---

## 5. Deferred, with where it returns

| Deferred | Returns in | Why it is safe to wait |
|---|---|---|
| `pools_exactly_one_competition` + the XOR, `DROP NOT NULL` | full L4 | Production has run the both-populated shape for a week |
| The 50-site `CompetitionRef` type sweep | full L4 | Only needed once `tournament_id` goes NULL |
| Six containment selectors | when the §2 constraint is broken, or L7 | Structural today; the constraint is tested |
| `snapshot_pool_ranks` `PUBLIC`/`anon` grants | **security backlog, not the league** | Pre-existing, unrelated to leagues, and worse than it looks |
| Mobile (M1 hard block, then repoint) | M1 **soon** — see below; the rest L14 | M1 is a live hole: the deployed picker offers the Premier League |
| Notifications, admin/ops, side-effect drain, analytics/XP/badges | L8–L12 | None is on the create→pick→score→see path |
| `pool_round_states` cleanup for PTQPZ797 (38 stale rows) | full L4 | Inert; nothing reads them for a league pool |

⚠ **M1 is not really deferrable.** `mobile/app/create-pool.tsx` currently offers
Premier League 2026/27 and the ended World Cup in its picker. The fix is already
written and committed (`150ab5e` + `050043d`). It needs an OTA, not new work.

---

## 6. Honest risks

1. **The §2 constraint is the whole containment story.** If the S2 write path
   sets `has_submitted_predictions` "for consistency with the World Cup", three
   scoring selectors start picking up league entries silently. Hence the test.
2. **Two competition columns can disagree.** Nothing enforces that
   `league_season_id`'s season matches `tournament_id`'s placeholder. In the
   slice there is one league, so the blast radius is one row; at two leagues it
   is a real hazard and the XOR must land first.
3. **Deferred work compounds.** Every step here is additive and none of it is
   thrown away — but the full L4 still has to happen before a second competition
   or before real customers.
4. **This trades invariants for visibility, deliberately.** That is the point,
   and it is Ryan's call, recorded here so the trade is not rediscovered later as
   an accident.
