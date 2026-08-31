# Showdown sealed draw — implementation plan

**Date:** 2026-08-30 · **Status:** ✅ **APPLIED AND VERIFIED IN PRODUCTION.** Migrations 116, 117 and
118 are live on `ujthamlehjyubbzxbnes`, each hash-checked byte-identical to the repo before the next
was applied. `scripts/verify-showdown.ts` reports ALL CHECKS PASSED, including the member-JWT seal
pass. Browser pass done on the seeded pool. See §12.
**Decision:** Ryan, 2026-08-30 — *"we are going to hide the draw from all users and reveal them week
by week so it is a surprise."* This reverses the **publishing** half of the 24 Aug call. The
round-robin itself stands.
**Reveal instant:** ✅ **R1 — a duel opens when its matchweek opens for picks.** Ryan, 2026-08-30.
See §1 for the two options this rules out and why.
**Design + mockups:** artifact *Showdown Fight Night* —
https://claude.ai/code/artifact/134bda8e-6e7a-449a-b995-e4a947b57918

Sealing the draw is a **disclosure** change, not a **variance** change. Gate 5 was satisfied on 24 Aug
by choosing a round-robin over a weekly random draw — nobody faces the strong pickers more often than
anybody else — and hiding *when you learn* the pairing does not touch that. What it does touch is
gate 1, and that resolves to a copy rule (§7), not a mechanic.

---

## 0. What was verified in the code, 2026-08-30

Not assumed — read:

| | |
|---|---|
| The policy being replaced | `083:92` — `"Members can view their pool's duels"`, a plain `FOR SELECT` over the **whole** fixture list for every pool member |
| Duel read on the **user** client | `app/pools/[pool_id]/page.tsx:164` → `readPoolDuels(supabase, …)`, where `supabase = await createClient()`. **RLS applies.** |
| Duel read on the **service-role** client | `lib/league/poolCards.ts:540` → `admin.from('league_duels')`, reached from `app/pools/page.tsx:285` **and** `app/dashboard/page.tsx:367`. **RLS does not apply.** |
| service_role vs RLS | Supabase docs, fetched: the secret key *"authorizes access through the `service_role` Postgres role, which has the `bypassrls` attribute"*, and bypasses *"only when the request carries no user access token"*. `createAdminClient` (`lib/supabase/server.ts:64`) sets `persistSession:false` and carries none — so it bypasses. |
| Storing a reveal instant | Migration **110** *deleted* a stored `revealed_at` on exactly this argument: it *"was never a fact about the pool. It was a record of when we got round to writing it down."* **Derive, do not store.** |
| The open-matchweek rule | `league_open_matchweek(season_id)` — one definition (101), already `GRANT`ed to `authenticated` (102). Migration **103**'s lesson is explicit: the rule existed four times and the copies drifted. **Call it, never inline it.** |
| Ordering trap | Rounds are played out of numerical order — *minimum gap **−121 days*** across three real seasons (101). A `matchweek_number <= open` predicate is **wrong**; it must compare `lock_at`. |
| `league_matchweeks` RLS | `USING (true)` (`050:385`) — readable by everyone, so a sub-select from inside the duels policy neither recurses nor gets filtered. |
| Regeneration guard today | Migration **100** already refuses to redraw the live matchweek: *"never the LIVE matchweek if it already has a draw… redrawing it swaps the opponent of somebody who has already picked."* |
| Verify script | `scripts/verify-showdown.ts:48` uses `createAdminClient()` → keeps full visibility → its round-robin assertions survive the seal unchanged. ⚠ Which is also the trap — see §8. |

---

## 1. 🔴 The decision that has to come first — when does a duel open?

The reveal instant is derived, so the only question is *from what*. This changes the product feel and
one option has a hole in it.

| | Reveal at | What it means | Cost |
|---|---|---|---|
| **R1** ⭐ | The matchweek **opens for picks** | You learn your opponent at the moment you can first pick against them | Zero — `league_open_matchweek` already computes it |
| **R2** | The **previous** matchweek's window closes | Sunday night: "that fight is over, here's the next one" | Derivable from 094's window-close |
| **R3** | A fixed **Monday 09:00** | The concept note's ritual | Needs a stored or computed instant per matchweek — against 110's grain |

**Recommended: R1.** R2 and R3 both open a gap. Under the existing matchweek rhythm, MW5's picks open
the moment MW4 locks — so under R2 or R3 a member can pick their whole MW5 sheet on Friday and only
meet their opponent on Sunday or Monday. That guts the thing the redesign is for: *picking against a
named person*. R1 has no gap by construction, needs no new derivation, and the reveal is also the
"picks are open" push you would send anyway.

The cost of R1 is that the ritual moves off Monday morning — for a Friday-20:00-locking league the
draw opens Friday evening. That is arguably the better slot (weekend, everyone is around), but it is
a change from the concept note and it is **yours to confirm**.

Everything below assumes R1. R2/R3 change §3 only.

---

## 2. Two gates, because one is not enough

This is the single most important structural point in the plan.

```
  authenticated client ──► RLS on league_duels          ◄── Gate A
  service-role client  ──► explicit filter in the query ◄── Gate B  (RLS cannot see this path)
```

`poolCards.ts` renders the Showdown tile — *"the duel, the record, and who you play next"* — on both
the pools list and the dashboard, through a client that **bypasses RLS by design**. Ship Gate A
alone and the policy is real, the pool page is sealed, and the tile on the pools list keeps printing
next week's opponent's name.

> **The rule to carry forward:** RLS defends the `anon`/`authenticated` path only. Every service-role
> reader of `league_duels` filters explicitly, and adding a new one without a filter is a leak, not a
> style question.

---

## 3. Migration 116 — the sealed draw

Replaces 083's policy. A duel row is visible when the viewer is a member **and** its matchweek is not
in the future, measured by lock time.

⚠ **As built, the reveal rule is a `SECURITY DEFINER` helper rather than an inline sub-select** — a
change made while writing it. `league_open_matchweek` is REVOKEd from `anon` (102), so a policy
calling it directly would raise *permission denied* for an anon reader instead of returning zero
rows, and Postgres does not promise to evaluate the membership `EXISTS` first, so the short-circuit
cannot be relied on. An error where empty rows belong is the discarded-PostgREST-error trap pointing
the other way. The helper still **calls** `league_open_matchweek` rather than restating it, so 103's
one-definition rule holds.

```sql
CREATE OR REPLACE FUNCTION public.league_duel_is_revealed(
  p_pool_id uuid, p_matchweek_number integer
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM pools p
      JOIN league_matchweeks m
        ON m.season_id = p.league_season_id
       AND m.matchweek_number = p_matchweek_number
     WHERE p.pool_id = p_pool_id
       AND m.lock_at IS NOT NULL
       AND m.lock_at <= COALESCE(
             (SELECT o.lock_at FROM league_matchweeks o
               WHERE o.matchweek_id = league_open_matchweek(p.league_season_id)),
             now())
  );
$fn$;

CREATE POLICY "Members see duels up to the open matchweek"
  ON league_duels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM pool_members pm JOIN users u ON pm.user_id = u.user_id
       WHERE pm.pool_id = league_duels.pool_id
         AND u.auth_user_id = (SELECT auth.uid())
    )
    AND league_duel_is_revealed(league_duels.pool_id, league_duels.matchweek_number)
  );
```

Four things in that predicate are load-bearing:

1. **`lock_at <=`, not `matchweek_number <=`.** The −121-day finding. Ordering by number reveals a
   matchweek whose games are weeks away while an earlier-locking one is still sealed.
2. **`COALESCE(…, now())`.** When the season is over `league_open_matchweek` returns NULL, and
   `lock_at <= NULL` is NULL — which would hide *every duel of a finished season*, including settled
   results. The fallback keeps history readable.
3. **`m.lock_at IS NOT NULL`** seals a matchweek that has no fixtures yet. ⚠ It also permanently
   seals one the floor-of-5 has emptied (see 106) — those duels can never settle either, so this is
   consistent, but it needs a test rather than an assumption.
4. **`(SELECT auth.uid())`** stays wrapped, as in 083, so it evaluates once rather than per row.

**Also in 116:** rewrite the `COMMENT ON TABLE league_duels` — it currently says rows exist unsettled
*"so the schedule can be published in advance"*, which will be false.

---

## 4. Migration 117 — one definition of the boundary, then the shuffle

### 4a. Make the generator call `league_open_matchweek`

Migration 100 computes its own first-open matchweek:

```sql
SELECT MIN(matchweek_number) INTO v_first_open
  FROM league_matchweeks
 WHERE season_id = v_season AND (lock_at IS NULL OR lock_at > now());
```

That is `MIN` **by number**; `league_open_matchweek` is `MIN` **by lock time**. For out-of-order
rounds they disagree — which is precisely the drift 103 was written to end, and 100 predates it.

Today that is a latent inconsistency. Under a sealed draw it becomes a **visible** bug: the line
below which duels are revealed and the line below which regeneration refuses to redraw would be two
different lines, so a member could be shown "you v Priya" on Friday and find it changed on Saturday
when somebody joins. Point both at the function.

**The happy finding:** with that one change, the reveal boundary and the redraw boundary are provably
the same line, and 100's existing guard — *"never the LIVE matchweek if it already has a draw"* —
already delivers the rule the sealed draw needs, with nothing else to build.

### 4b. Round-order shuffle, per cycle

A ten-entry pool is nine rounds per cycle, so by round seven a member can derive the rest by
elimination. Shuffle **which round lands in which matchweek**, per cycle.

- ⚠ **Deterministic, never `random()`.** Seed the permutation from something stable —
  `hashtext(p_pool_id::text || v_cycle::text)` — so regenerating after a join produces the *same*
  future as before for every matchweek nobody has seen. A `random()` reshuffle on every join is a
  different fixture list every time somebody's cousin joins in October.
- Gate 5 is untouched: the set of pairs per cycle is unchanged, so everyone still plays everyone the
  same number of times. Only reveal order moves.
- `scripts/verify-showdown.ts` already asserts the round-robin property itself, so it will catch a
  shuffle that accidentally drops or repeats a pair. Run it before and after.

---

## 5. The code that argues the opposite

Both of these currently make the case *for* publishing, at length. Left alone, the next person reads
them, concludes the hiding is a bug, and removes it.

| File | What it says now |
|---|---|
| `lib/migrations/083_showdown_duel_schedule.sql` | *"`league_duels` IS the fixture list. Unsettled rows are written at pool creation so the schedule can be shown in advance, which is the honest half of choosing round-robin over a draw."* |
| `app/pools/[pool_id]/DuelsTab.tsx` (header) | A section headed *"Why the fixture list is shown in advance"*, ending *"a schedule we have already computed and withhold is a different kind of manipulation."* |
| `lib/league/poolCards.ts:530` | *"the opponent is readable weeks ahead — which is the honest half of…"* |
| `lib/leagueModeInfo.ts` (showdown) | *"The fixture list is published in advance and rotates…"* — member-facing copy, so this one is also §7 |

`SPORTPOOL_PROGRAMME.md`'s Showdown row records "published round-robin" in two places. **That is
Gill's**, not this change's.

---

## 6. The UI

| Change | Where | Note |
|---|---|---|
| **Sealed card** — your corner, redacted opposite corner, countdown to the open | new, on the Duel tab | The anticipation surface the seal makes possible. Mockup screen 01. |
| Remove **"Coming up"** and the season fixture list | `DuelsTab.tsx` | These are the two things the seal deletes. Roughly half the tab. |
| Keep the **duel table** | `DuelsTab.tsx` | Built from settled duels only, so it is unaffected. ⚠ It calls `ensure()` for every duel row including unsettled — with future rows gone, a brand-new pool shows an empty table until the first matchweek opens. Render an empty state rather than a blank card. |
| **Tab reorder** — Duel first | `PoolDetail.tsx:1307` | Today `duels` is *appended after* `results`, which is the bolt-on, literally. |
| **Gate B filter** | `poolCards.ts:538-542` | `.lte('matchweek_number', <open>)` is **wrong** (§3.1) — filter on the same lock-time boundary. The function already loads the open matchweek per season at step 1; reuse it. |
| Sealed state on the tile | `poolCards.ts` | A tile that says "sealed — opens Friday" instead of vanishing. |

---

## 7. The copy rule

The mechanic passes disclosure **if the words are accurate**, and fails if they are not.

- ✅ *"Your fixtures were drawn when the pool was created. We show you one week at a time."*
- ✅ *"Your matchweek 5 opponent"*
- ❌ *"You have been randomly paired with…"* — the pairing did not happen this Monday, and it is not
  random.

Put the true sentence in Pool Info (`leagueModeInfo.ts`, showdown) and never claim a weekly draw
anywhere else. The reveal does all the work the word "random" was doing, at none of the risk.

**One refusal to record now:** do not sell an early peek at the draw. It is the obvious monetisation
of a sealed draw, it sells a picking advantage, and it turns the seal into a sales device.

---

## 8. Verification

⚠ **The existing script cannot see this change.** `verify-showdown.ts` runs as service role, which
bypasses RLS — so it would pass with the seal wide open. A test that cannot fail is worse than no
test here.

1. **Add a member-JWT pass.** Sign in as a real pool member, read `league_duels`, assert: rows for
   the open matchweek and earlier are returned; rows beyond it are **not**; count matches exactly.
   Run the same read as service role and assert it *does* see the future — that is what proves the
   policy is the thing doing the work.
2. **Non-member returns zero**, as before.
3. **Season-over case:** with every matchweek locked, a member still sees the whole settled season
   (the `COALESCE` branch).
4. **Out-of-order rounds:** a matchweek numbered higher but locking earlier is revealed. This is the
   −121-day case and the one a number-ordered predicate gets wrong.
5. **Emptied matchweek** (`fixture_count = 0`): sealed, and nothing else breaks.
6. **Redraw safety:** with MW*n* open and drawn, add a member and assert MW*n*'s pairing is byte-identical.
7. **Round-robin still holds** after the shuffle — the existing assertions, unchanged.
8. **Browser pass** on the pools list *and* the dashboard, signed in as a member, network tab open:
   the future opponent must not appear in any response body. This is the check that would have caught
   Gate B.
9. `npx tsx scripts/verify-select-columns.ts` — standing rule, and this touches a policy that reads
   three tables.

---

## 9. Sequence

| | | Rough |
|---|---|---|
| 1 | Confirm **R1** (§1) | ✅ Ryan, 2026-08-30 |
| 2 | Migration 116 — the policy, + the table comment | ✅ written |
| 3 | Migration 117a — generator calls `league_open_matchweek` | ✅ written |
| 4 | Gate B — the `poolCards.ts` filter | ✅ done |
| 5 | Verification (§8), including the member-JWT pass | ✅ written, ⛔ not run |
| 6 | Rewrite the comment blocks (§5); Gill updates the programme | ✅ code · ⛔ Gill |
| 7 | Migration 118 — round-order shuffle | ✅ written |
| 8 | Sealed card + tab reorder + DuelsTab surgery (§6) | ✅ done |
| 9 | The walk-out, the three pushes, win-by-KO, the decider | ⛔ separate, see the artifact |

**Steps 2–6 are the seal.** Steps 7–9 are what make it worth having. Nothing after step 2 is safe to
demo until step 5 passes, because a half-sealed draw looks identical to a sealed one right up until
somebody opens dev tools.

---

## 10. Risks

| | |
|---|---|
| **Gate B is forgotten** | The whole seal fails silently and looks fine on the pool page. Mitigation: §8.8 is a browser check on the *pools list*, not the pool. |
| **A future service-role reader** | Same failure, later, by someone who never read this. Mitigation: the rule in §2 goes in the 116 header where a reader of the policy will meet it. |
| **The two boundaries drift again** | §4a fixes today's copy; a third inlining would reintroduce it. Mitigation: 103's comment already says this; extend it to the generator. |
| **RLS cost on the read path** | The policy adds a join + a `STABLE` function call. One pool's duel read is ~190 rows and `.eq('pool_id', …)`-scoped, so this should be nothing — but measure, don't assume, given the read-saturation history. |
| **Empty duel table on a new pool** | Cosmetic, but it is the first thing a new commissioner sees. §6. |

---

## 11. What does not change

The scoring layer is untouched: 3/1/0 with no margin carried, `duel_points` leading one rank cascade,
`league_score_duels` still reading a single number and never learning which depth it sits over. The
circle method, the settle trigger, the bye handling and the four regeneration doors all stay.
**Double Down stays rejected** — the banker one level up, settled in Decision 9.

**The timing is unusually good.** Showdown is built across 083–085, 095 and 100 and has scored **zero
real entries** — no production pool carries `league_mode = 'showdown'`. There is no live pool to
migrate and nobody who has already been shown a published fixture list. Sealing it now costs a policy
rewrite; sealing it after launch would mean taking something away from people who already had it.

---

## 12. Build status, 2026-08-30

### Written and green

| | |
|---|---|
| `lib/migrations/116_the_draw_opens_one_week_at_a_time.sql` | `league_duel_is_revealed()` + the replacement policy + the corrected table comments |
| `lib/migrations/117_one_line_for_the_reveal_and_the_redraw.sql` | `league_generate_duel_schedule` now calls `league_open_matchweek` and states the eligible set once, in lock order |
| `lib/migrations/118_the_draw_does_not_run_out_of_surprises.sql` | Round order permuted per cycle, hashed from `(pool_id, cycle)`. Also moves the round index off a loop counter and onto the matchweek's own place in the season |
| `lib/league/poolCards.ts` | **Gate B** — `revealed()` filters duel rows on the service-role path |
| `lib/league/read.ts` | `sealedMatchweekNumber` + `sealedOpensAt` on the league view |
| `app/pools/[pool_id]/DuelsTab.tsx` | Sealed card in, "Coming up" and the season fixture list out, header rewritten |
| `app/pools/[pool_id]/PoolDetail.tsx` | **Duel is the first tab** and the default tab for a Showdown pool; label singular |
| `lib/leagueModeInfo.ts`, `LeagueScoringRulesTab`, `LeagueHowToPlayTab` | The disclosure copy (§7) |
| `lib/migrations/083_…sql` | Superseded-by breadcrumb; the SQL is untouched |
| `scripts/verify-showdown.ts` | `theSeal()` — the member-JWT pass |
| `lib/league/__tests__/showdownLateJoiner.test.ts` | Re-pointed at 117; new assertions for the seal and Gate B |
| `lib/__tests__/leagueModeCopy.guard.test.ts` | The disclosure gate as a test |

`npx vitest run` — **1,084 passed**. `tsc` — no new errors (the 3 remaining are the pre-existing
`FormData`/`node_modules` corruption). `eslint` on touched files — **0 errors**.

### ⚠ Owed before this is real

1. **Neither migration has been applied anywhere.** Before running 117, hash the live function —
   `SELECT md5(prosrc) FROM pg_proc WHERE oid = 'public.league_generate_duel_schedule'::regproc` —
   and confirm it matches 100's body. Migration 055's lesson.
2. **`scripts/verify-showdown.ts` has not been run.** It needs the migrations applied first. It is
   the only check that can see the policy at all, and it creates and deletes a scratch auth user.
3. **No browser pass.** The pool page needs a signed-in session, which this session could not
   create. The Duel tab, the sealed card and the tab order have **not been seen rendering**. Green
   tests are not a rendered screen — this codebase's own history says so.
4. **The shuffle is written but unrun.** Its algorithm was verified by simulation rather than
   against Postgres (§13); `theShuffle()` in the verify script is the real check.
5. **Gill has not recorded the reversal** in `SPORTPOOL_PROGRAMME.md`, which still says "published
   round-robin" in two places.

### One correction to §2

The plan said shipping Gate A alone would leave the pools-list tile "printing next week's opponent".
Reading the code, that was overstated: `poolCards.ts` only ever surfaces the **open** matchweek's
opponent, which R1 reveals anyway. The over-fetch is real — the whole fixture list is pulled into
server memory — but nothing downstream puts a sealed name on screen. Gate B is therefore
**defence in depth**, not a live leak fix: it stops a sealed row entering the process at all, so a
field added later cannot leak one. The live leak was `DuelsTab`'s "Coming up" list, on the
authenticated path, which Gate A closes.

---

## 13. The shuffle, as built (migration 118)

Written after §4b, and it turned out to need one more change than §4b described.

**The round index was keyed on the wrong thing.** 083 and 117 both derived it from `v_k`, a counter
starting at 0 on whichever matchweek the regeneration happened to touch first. So a pool regenerated
in November restarted the rotation — replaying the cycle it had already played in August. 118 keys it
on the matchweek's own position in the season's lock order, which makes a matchweek's round the same
whenever the generator runs. That is what lets the permutation be stable; it also fixes the rewind.

**Deterministic, from `md5(pool_id || cycle || round)`.** No `random()`. Regenerating an unchanged
pool produces a byte-identical future — which matters far more under a seal, because a member cannot
see it churn.

**Verified by simulation**, since there is no Postgres here to run it against. The algorithm was
reimplemented and checked for 6 entries, 5 entries (odd, so byes) and 10 entries × 38 matchweeks:

| | |
|---|---|
| Every pair exactly once per cycle | ✅ 15 / 10 / 45 pairs |
| Byes one each per cycle | ✅ |
| Opponent counts within one across the season | ✅ spread 1 |
| Actually changes the schedule | ✅ 33 of 36 rows differ from sequential |
| Deterministic across runs | ✅ identical |
| A different pool gets a different order | ✅ |
| Sequential made cycle 1 repeat cycle 0 exactly | ✅ confirmed — that is the leak being closed |

⚠ **Elimination inside a cycle is unchanged**, and cannot be fixed by reordering: with n entries a
member has met everyone by round n−1, so the last round of every cycle is deducible. The shuffle
stops the *second and later* cycles being free information, which is where the real leak was.

**Gate 5.** The pair multiset per cycle is untouched — same rounds, same pairs, same counts, same
byes — so nobody can face the strong pickers more often than anybody else, which is the failure that
made us reject a weekly random draw. What moved is *which week* a fixed set of duels lands in, and
that assignment was always ours: there is nothing in the sport that says circle-method round 0
belongs in August. The change is how we make a choice we were already making. If that reading is ever
disputed, the fallback is one line — delete the permutation and `v_r` returns to `v_slot`.

---

## 14. Applied and verified, 2026-08-30

**Migrations.** 116 → 117 → 118, in order, hash-checked between each:

| | |
|---|---|
| Live generator before | `823326d5…` = migration 100's body, byte-identical — the preflight §12 asks for |
| After 117 | `73db8963…` = 117's file, byte-identical |
| After 118 | `648f77fa…` = 118's file, byte-identical, `v_perm` present, no `random()` |
| Policy | `Members see duels up to the open matchweek`, exactly one on `league_duels` |

⚠ Your own apply had not reached the database. `pg_proc` showed no
`league_duel_is_revealed` and the generator still carrying `v_first_open`. The old policy was intact,
so nothing was half-applied — but it is worth knowing that 117 and 118 would each have "succeeded"
alone, which looks like partial progress rather than a failure.

**The seal, on real data.** The two seeded pools went from 185 → **10** and 148 → **8** visible
duels, both showing matchweeks 2–3 only (MW2 locked, MW3 open). Client-side, the served payload
contains `matchweek_number` 2 and 3 and nothing else — matchweeks 4–38 never reach the browser.
That is §8.8, and it is the check that would have caught a UI-only hide.

**`verify-showdown.ts` — ALL CHECKS PASSED**, including §8's member-JWT pass: service_role sees 12
matchweeks, the member sees 1, every later week withheld, a non-member sees none. Section 9 confirms
the shuffle is deterministic and that cycle 1 is not a repeat of cycle 0.

### Three faults in the verification script, all older than this work

It had been **unrunnable since migration 111** landed:

1. Setup borrowed whichever tournament `.limit(1)` returned and paired it with the scratch season —
   111 raises on the mismatch. It now brings its own tournament on the scratch triple.
2. `theSeal()` inserted a `users` row, but `on_auth_user_created → handle_new_user` already writes
   one. It now reads what the trigger made.
3. `role: 'member'` is not in `pool_members_role_check`. That one was mine.

### ⚠ A stale expectation, corrected — and worth remembering

`"the schedule starts at the first matchweek still open — 5"` encoded **095**'s behaviour. Migration
100 added the guard against redrawing a live matchweek that already has a draw, which makes the
answer **6**, and the assertion was never updated. It now asserts 6, asserts the *precondition* that
makes it 6, and reads against `POOL_LATE` — no draw yet, same open matchweek, still 5. One guard,
both branches.

### 🐛 And one real bug, found only in the browser

`featuredMatchweek = inPlayMatchweek ?? openMatchweek` collapses two weeks that both exist all
weekend. That was survivable while "Coming up" carried the open week; sealing the draw deleted that
list and took the open duel with it. On screen: matchweek 2 "being played now", matchweek 4 sealed,
and **matchweek 3 — the one being picked — nowhere**, despite being revealed and in the payload.

This is the OPEN ≠ IN PLAY conflation again, reintroduced from the other direction by a deletion.
Both weeks now render, each saying which it is, and the record card sits below them so
playing / picking / sealed read as one timeline. Fixed in `e651a3e`.

**Green tests did not catch it, and could not have.** Nothing asserted that the open matchweek
appears on screen.

### Still owed

- **Styling** — scoped display face (`--font-display`), Showdown ceremony surfaces only. Ryan's call
  2026-08-30. Now unblocked.
- Step 9 of §9: the walk-out, the three pushes, win-by-KO, the decider.
