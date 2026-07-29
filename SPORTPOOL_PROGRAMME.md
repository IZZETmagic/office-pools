# SportPool Programme

Single source of truth for everything we want to build, fix, or decide — and for the
**decisions already made**, so they don't get re-litigated.

A *programme*, not a roadmap, because SportPool is now several distinct projects running under one
banner rather than one ordered list. Day-to-day delivery is still ordered by priority
(**Now → Later**) and tagged by category; the **Projects** below are the larger bodies of work those
items roll up into.

## Where this stands

The World Cup shipped, completed, and is nearly wound down — what's left of it is one ops send and a
handful of residual bugs. The record itself is current again: the two things this document was
missing, the shadow read-path cutover of 2026-07-19 with its rollback and the ~324k-point podium
remediation of 2026-07-21, are now written down, so the programme and the code broadly agree for the
first time since the final. The picture that leaves is not comfortable. **Three 🔴 risks are live and
unmitigated.** Two of them are the same structural failure: **this product has no soft-delete
anywhere**, and `pool_entries` carries 21 cascading children — so an admin tapping *Delete Pool*
destroys every member's predictions (two surfaces, six pools already gone), and *any* membership
exit — leaving, being removed, deleting an account, stop-participating — permanently purges the
entry, every prediction, every derived score and the append-only badge history, with **no application
code involved in three of the four paths** and **no count of how often it has already happened**. The
third is that any Premier League pool created today would score **zero, silently**, because the
group/knockout binary is welded into the scoring price lookup and not just the gate. Behind them sit
**nine 🟠** (five, plus four opened by the 2026-07-26 performance session), including one Ryan
knowingly accepted (empty-bracket bonus inflation, ~243k pts) on the condition it be fixed *before
the next competition* — **that condition is now due**.

The next milestone is the **Premier League 2026/27 season, mid-August**, and on the foundations
recorded here it is **not reachable**: league scoring and bonuses don't exist, matchweek deadlines
and auto round-opening don't exist (Decision 7 calls the latter *"a prerequisite, not polish"*), the
sync cron is still single-tenant on three env globals, and the importer plus migration 024 are
drafted but uncommitted and unapplied. Almost none of that is blocked on capacity — the **sequencing
is blocked on five decisions only Ryan can make**: what "archive" means now that migration 025b
constrains `pools.status` to `('open','completed')`; **what leaving a pool should do to a member's
history**, now that we know it purges it; which engine should score the EPL (the flags are now
known — prod is scoring everything, shadow reads are off — so what remains is the choice, not the
uncertainty); whether EPL scope shrinks or the date moves; **what "live" has to mean**, since the
stated goal says *real-time leaderboard* and a recorded principle says *minute-cadence is
sufficient*; and whether the post-tournament survey still goes out now that it is past its own time
box.

A system-design section was added 2026-07-26 from two research workflows, and it turned up one thing
that belongs in this summary: **the ledger does not reconcile to itself.** 29 of 4,985 entries show a
total their own line items don't support — 26 of them **too high, by 149,525 points**, three carrying
points with no line items at all. It is bounded and it does not spread, but "100% accurate scores" is
the product's first promise, and right now nothing checks that promise continuously; this was found
by asking, not by an alarm. One standing caveat on everything above: **thirteen groups of claims here
depend on production state and cannot be verified from code** (eight, plus five added by the
2026-07-26 performance session — every measured number in it) — they are listed in the register, and
unverified is not done.

**Added 2026-07-26 (performance session).** A site-wide performance pass measured where the database
actually spends its time and, in the process, found another instance of the failure mode above:
`entry_xp_state.total_xp` / `.current_level` have **two writers computing different quantities**, so
the level shown on `/pools` and `/dashboard` today is whichever path last touched the row. That is
live and user-facing now, and it is **not** a caching problem — the parity pass that was meant to
unblock a read-path flip is what exposed it. Fixes for it, and for **13 of 14** whole-table
`match_conduct` reads (four of them inside scoring engines, where PostgREST's silent 1,000-row cap
becomes wrong bonuses the moment a second competition exists), are **written, tested and entirely
uncommitted**. Nothing is applied or deployed, so **production is unchanged** — treat all of it as
still live until migration 026 is applied and the deploy is confirmed. The session also introduced
one regression of its own — full-pool analytics on the scoring path (**R15**) — and left one
deliberate blocker in place (**R16**, `advance-teams`), which must clear before a second competition
is ingested. **R15 and R14 were raised by this register, confirmed against the code by Ryan, and
fixed the same day; R13's open question on `current_level` was answered and migration 026's comment
rewritten** — see the register and *Known drift*. None of that changes the headline: it is all still
local, and none of it is live.

**Last updated:** 2026-07-25 · Renamed from `ROADMAP.md`; absorbed the product-decision record from
the multi-sport planning session (8 settled decisions, now under *Project: Multi-sport platform*).
· **2026-07-12:** full audit against the codebase — completed items moved to per-section **✅
Completed** tables; PARTIAL items annotated with what the code actually shows; post-deadline
prediction lock **shipped** (DB trigger), XL→Medium downgrade **done**, tie-break OTA **published**.
· **2026-07-19:** added *Boost banter engagement*, grounded in an organic banter-usage analysis
(~1,383 real messages / ~315 people; ~7% of members post, ~67% of feed is auto share-cards).
· **2026-07-26:** opened the **🚨 Risk register** (below, R1–R11) from a fresh audit against code,
migrations and git. Four targeted corrections came out of it, each because the document contradicted
a risk: the shadow **read-path cutover and its rollback** were unrecorded, the **podium remediation**
(~324k pts, 524 pools) was missing entirely, the feedback survey's "blocked on a deploy" line was
stale, and *Delete Pool* named only the web door — **mobile has a second one**. Other drift found in
that audit is listed but deliberately not yet actioned; see the end of the register. Also added
*Where this stands* (above) and *Order of deliveries — proposed* (after the register); the latter is
a recommendation derived from what this document already records, **not a plan Ryan has agreed**.
· **2026-07-26 (later):** added **R12** — every membership-exit path permanently purges the entry
through a **21-table cascade**, with no soft-delete anywhere. R1 was scoped to pool destruction and
the two are cross-linked under *The destruction class*. New **Gate A2** (what leaving should do to a
member's history) is open and unanswered.
· **2026-07-26 (system design):** added *🏗️ System design* from two research workflows — the goal
restated as four testable properties (P1–P4), seven production-verified findings, six ⬜ unmeasured
analysis claims kept explicitly separate from them, a proposed direction, and a *"Not yet — and the
trigger"* table. Produced **R17** (the ledger doesn't reconcile — 29 entries, 149,525 pts over) and
**R18** (the parity alarm writes into a table nothing reads), and answered the factual half of
**Gate B**. New **Gate D** (what "live" has to mean) is open.
· **2026-07-26 (performance session):** recorded the site-wide performance + caching pass and the
**`entry_xp_state` two-writer bug** it surfaced. New section *⚡ Performance & caching*, new 🔥 Now
item *XP has two writers*, four new risks **R13–R16**, five decisions Ryan settled this session, and
corrections to *Leaderboard precompute*, *Bounded reads*, and *Kickoff write spike*. **Everything
from that session is local and uncommitted** — nothing is applied to prod, so the risks it fixes are
still live in production exactly as before.

## Projects in this programme

| Project | What it is | Status |
|---|---|---|
| **Multi-sport platform** | Generalise the single World Cup product into a reusable multi-competition platform. Product decisions settled 2026-07-25; foundations still TODO. | 🔵 Designing |
| **Showdown / EPL launch** | H2H duels, persistent rivalries, and the first league season. Target Aug 2026. | 🔵 Designing |
| **Scale & scoring integrity** | Shadow engine, leaderboard precompute, IO reduction, scoring correctness. | 🟢 In flight |
| **Performance & caching** | Stop over-fetching, stop recomputing, then cache what's left — web + mobile. Opened 2026-07-26; three fixes written locally, none landed. | 🟢 In flight |
| **World Cup wind-down** | Residual bugs, feedback surveys, knockout ops. | 🟡 Closing out |
| **Live match & rich football data** | Squads, line-ups, events, player pages. | ⚪ Not started |
| **Monetisation & cosmetics** | Sponsored pools, premium analytics, avatar IAP. | ⚪ Gated |

Each backlog item has four fields:

- **Is** — what it is, in plain English.
- **Touches** — the code / systems / tables it involves.
- **Effort** — rough order-of-magnitude estimate (not a commitment).
- **Done when** — the end goal and how we verify it.

**Legend** — Categories: `Bug` · `Scoring` · `Feature` · `Design` · `Mobile` · `Infra` · `Multi-sport` · `Ops`
Status: 🔥 active/hurting now · 🔒 blocked · ⏳ waiting on your timing call · ✅ done (verified in code 2026-07-12)

### The disclosure gate

Any mechanic that touches notifications, rewards, or social pressure must pass one question before
it ships:

> **Would it still work if you wrote its actual mechanism in a one-sentence tooltip?**
>
> *"We pre-built next season with your 14 members so you only have to confirm"* — passes.
> *"We hold your score back a day so you come back"* — fails.

Dark patterns are covert by definition. If explaining it kills it, it was manipulation. The full
five-gate version is under *Project: Multi-sport platform → Decision 8*.

---

## 🚨 Risk register

> Standing reference, not an appendix. Opened 2026-07-26 from a full audit of this document against
> the code, migrations and git history. Every risk carries: **what · blast radius · trigger ·
> mitigation status · whether Ryan has already called it**, plus the backlog item it maps onto so the
> register and the backlog can't drift apart. **A risk Ryan has knowingly accepted stays here, marked
> accepted — it is not closed.**

**Levels** — 🔴 **Critical:** live now, currently destroying data, corrupting results or misleading
users · 🟠 **High:** one user action away, or certain to bite on a known date · 🟡 **Medium:**
degrades quality or trust, no data loss · 🟢 **Low:** cosmetic, or deferred by explicit decision.

**Ranking rule used here and in status updates:** anything that *silently produces wrong data*
outranks anything that is merely missing; after that, `(blast radius × likelihood) ÷ effort`. Silent
wrongness is this codebase's recurring failure mode — zero-scoring leagues, a truncated email
segment, a 20× rescale, phantom bonuses, predictions destroyed by a delete.

> **R1 and R12 share one root cause: there is no soft-delete anywhere in this product.** Every exit
> path is a hard `DELETE`, and `pool_entries` carries **21 `ON DELETE CASCADE` children**, so removing
> a single row destroys the entry, every original prediction, every derived score, and the badge
> history. They are listed separately because they have different actors, different triggers,
> different mitigations and different evidence: R1 has a documented incident count, R12 has **none at
> all**. Merging them would let R1's evidence vouch for R12's, or R12's unknown dilute R1's. See
> *The destruction class* below the table.

| # | Risk | Level | Blast radius | Trigger | Mitigation status | Ryan's call | Backlog item |
|---|---|---|---|---|---|---|---|
| **R1** | **"Delete Pool" destroys members' predictions.** Web runs five un-transactional deletes from the browser against an asymmetric RLS pair; **mobile is a second, separate door** — a single `supabase.from('pools').delete()` (`mobile/components/pool-detail/SettingsTab.tsx:222`). Scope of this row is **pool destruction**; membership exit is **R12** | 🔴 | **6 pools / 41 entries already destroyed**, earliest in June. **458 pools with an admin** are one tap away, of 623 live | One admin tap, on **either** platform. Elevated now — post-tournament tidying | **None applied.** The zero-deploy policy drop is identified, not run — and it covers the **web** door only | Documented-only 2026-07-21; *archive, not delete* decided 2026-07-25 — **not implemented** | *"Delete Pool" destroys every member's predictions* (🔥 Now) |
| **R17** | **The ledger does not reconcile to its own line items.** 29 of 4,985 entries have `scored_total_points ≠ Σmatch_scores + Σbonus_scores + point_adjustment` — **26 over by 149,525 pts**, 3 under by 4,975, **3 carrying points with no line items at all**; max single delta 9,825. Verified in prod 2026-07-26 (V1). **Does not contradict the 2026-07-21 ledger audit** — that asked "is anyone owed points?", this asks "does the total reconcile to its evidence?" | 🟠 | **29 entries of 4,985 (0.6%)**, ~154,500 pts of discrepancy in total. Bounded and non-propagating — but these are **final standings**, and 26 people are shown a score their line items don't support | Already live. Any member opening a points breakdown on an affected entry sees a total that doesn't match its own rows | **None.** No continuous reconciliation check exists — this was found by asking, not by an alarm | **New — no call made** | **None yet.** Directly violates **P1** |
| **R18** | **The parity alarm detects into a table nothing reads.** `shadow_score_diffs`: 849 rows, **418 in the last 24 h**, newest 2026-07-26 17:45, 3 `diff_kind` values. Verified in prod 2026-07-26 (V2). **This corrects the earlier belief that the alarm cron was failing** — the cron works; the consumer was never built | 🟠 | Unknown by construction: the system has been reporting discrepancies all day and **nobody is receiving them**. Whether these 418 rows relate to R17's 29 entries is **an open question, not a claim** — worth checking first, since it is cheap | Already live and firing | **None.** Detection exists; consumption doesn't | **New — no call made** | *Shadow scoring engine*. Violates **P3** |
| **R12** | **Every membership-exit path permanently purges the entry.** Leaving a pool, being removed, deleting an account, or "stop participating" all end in a hard delete that cascades through **21 tables** — predictions, all derived scores, `point_adjustments`, and `badge_unlocks`. **Three of the four doors contain no delete of entries or predictions in application code at all**; the destruction is entirely the DB cascade, which is why it is invisible from the route. `badge_unlocks` is designed as an **append-only permanent record** and cascades away with the entry — the permanent record is not permanent | 🔴 | ⚠️ **Unverified — no count exists.** Unlike R1 there is **no documented incident**, which is not evidence it hasn't been happening: nobody has looked. Requires a production query. Structurally the exposure is *every member who has ever left, been removed, or deleted their account*, across 623 pools | Four doors: **(1)** self-leave · **(2)** admin removes a member · **(3)** account deletion (cascades from `users`) · **(4)** "stop participating". Doors 1–3 are ordinary product actions available to any user | **None.** No soft-delete exists anywhere (0 `deleted_at`/`is_deleted` references in `app/`, `lib/`, `mobile/` — verified 2026-07-26) | **New — no call made.** Ryan's stated position 2026-07-26 is that this *should not happen either*. That is a direction, not yet a decision: see the open question in *Order of deliveries* → Gate A2 | **None** — this risk has no backlog item yet |
| **R2** | **A league pool scores zero, silently.** Not just the gate: `full.ts:89` / `progressive.ts:110` source predicted teams from a WC-shaped `knockoutTeamMap`, so a `regular_season` fixture resolves to null teams → gate false → 0. Bonuses iterate 12 hardcoded groups (`lib/tournament.ts:137`), so a league pool has no bonus path either. ✅ **Prospective, not live (2026-07-26):** zero `stage='regular_season'` rows exist in prod (V6) — **level unchanged**, because the trigger is one `tournaments` row away | 🔴 | **100% of points** in every EPL pool; scoring trust in the flagship next season. Currently **0 pools affected** | Creating an EPL `tournaments` row — **both create-pool wizards list tournaments unfiltered** (`components/pools/CreatePoolModal.tsx:107`, `mobile/app/create-pool.tsx:144`), so the row alone makes league pools creatable | **None.** Migration 024 staying uncommitted is the only thing holding the door shut — treat that as a safety catch, not a plan | Recognised in the item; not scoped or scheduled | *League ingestion (Premier League)* (Multi-sport → Foundational) |
| **R3** | **Three scoring default sets disagree; "Reset to defaults" rescales a live pool ~20×.** create = `group_exact_score: 100`, reset button = `5`, `bonus_champion_correct` stays `1000` | 🟠 | Any of **623 live pools**; one click turns 103 fixtures into decoration. Reset ladder is also non-monotonic (SF < QF) | An admin presses **Reset to defaults** on a live pool | None | **Decided 2026-07-25** (100/75/50 canonical, delete the dead bonuses, fix the ladder) — unimplemented, ~half a day | *Scoring config is internally inconsistent* (🔥 Now); Decision 6 |
| **R4** | **Shadow/prod podium divergence, behind an undocumented live kill switch.** Prod now *derives* the podium from completed matches (`lib/podium.ts`); the shadow bonus SQL still `JOIN`s `tournament_awards` (`drafts/2026-07-02_shadow_calculate_bonuses_scoped_changeonly.sql:164`) — **the same root cause prod just paid ~324k points to fix** | 🟠 | Last occurrence: **669 rows / ~324,375 pts**, concentrated in ~73 pools; 50 changed rank, **13 changed their #1** | Re-enabling shadow reads, or shadow scoring any competition that has a podium | Prod fixed and re-scored; **shadow not fixed**. ✅ 2026-07-26: the flags were read — `prod_scoring_enabled = true`, `shadow_read_enabled_pools = []` (V5) — so the divergence is **latent, not live** | No call recorded — the 07-19 cutover and its rollback were absent from this document until 2026-07-26 | *Shadow scoring engine*; *Podium bonus remediation* (✅ Recently shipped) |
| **R5** | **EPL mid-August is not reachable on current foundations.** Missing: league scoring + bonuses (R2), matchweek deadlines, **auto round-opening — zero code**, multi-tenant sync (`sync-fixtures/route.ts:67` still reads three env globals), importer commit + apply | 🟠 | The entire next-season target; Showdown sits behind it | The fixture list, mid-Aug — a fixed external date | None applied | Needs a **scope-or-date** call. Decision 7 already calls auto round-opening "a prerequisite, not polish" — 38 matchweeks × every pool, manually, is not viable | *Showdown / EPL launch* project; *Sync cron is single-tenant*; Decision 7 |
| **R6** | **Empty-bracket bonus inflation.** An unpredicted group falls through to the FIFA-ranking tiebreaker, so seeded order ≈ reality and near-zero predictors collect the bonuses | 🟠 | **~243,000 pts across 155 entries**; a near-zero predictor earns ~77% of a full predictor's bonus with ~2% of their match points. Retro-fixing demotes ~155 real people (~87 pools move) | Any competition with group standings | None — no "did they predict it" gate in `calculateGroupStandingsBonuses` (re-verified 2026-07-26) | **Accepted / deferred 2026-07-21**, on the condition "fix before the next competition" — **that condition is now due** | *Empty-bracket bonus inflation* |
| **R7** | **Admin churn is unmeasured.** `/api/admin/stats` has counts (pool admins, avg pool size, deleted accounts) but **no cohort or retention series** | 🟠 | The best-identified growth lever: preventing 20% of admin churn ≈ **+722 players** (Decision 7's table). Not silent-wrongness class — ranks below R1–R3 | Dated, not action-driven: the clean baseline is the **WC→EPL transition**, which is happening now and closes at EPL start | None built | Decision 7 says "instrument admin retention"; nothing exists | Decision 7; *Enhanced super-admin stats* |
| **R8** | **The feedback survey is past its own time box, and was held on a blocker that has cleared.** All four fixes are on `origin/master` as of 2026-07-25 | 🟡 | 477 admins + 3,652 players; response quality decays with distance from the final (16 Jul) | Already triggered — the stated window was "~1 week of the final", i.e. ~23 Jul | Code fixes verified in the repo; **deploy status is prod state, unverified** | Send-or-drop is Ryan's | *Post-tournament feedback surveys — send them* (🔥 Now) |
| **R9** | **Repo lives in iCloud-synced `~/Documents`.** Now **18** duplicate artifacts on disk, including `.git/index 2` through `.git/index 7` | 🟡 | Local only — **but** it can flip a byte in tracked source, which can then be committed and pushed | Any build or git operation while iCloud syncs | Workaround only (clean `npm ci` in a throwaway worktree; scan `git diff` for null bytes) | Known; ~1 hour to move the repo — not done | *iCloud corrupts the local checkout* (🧹 Housekeeping) |
| **R10** | **The archive decision conflicts with the shipped schema.** Migration 025b constrains `pools.status` to `('open','completed')`, so an `archived` state is impossible without another migration; today's "Archive Pool" button just sets `completed` | 🟡 | Blocks "a reversible archive that keeps history" as specified — the replacement R1 depends on | Implementing the archive decision | None — needs either a migration or a ruling that archive *means* `completed` | Unrecognised conflict; needs a ruling before R1's proper fix is built | Decision 7 *"Archive, not delete"*; *"Delete Pool" destroys…* |
| **R13** | **`entry_xp_state` has two writers with two different formulas — the level shown to users is whichever ran last.** `lib/push/badges.ts` (pre-fix) wrote `Σ match_scores.total_points + badgeXP`; `lib/analytics/entryAnalytics.ts` writes `computeFullXPBreakdown` XP (`BASE_XP[tier] × STAGE_MULTIPLIERS` + crowd/streak events + badge XP). Different **quantities**, both measured against the same `LEVELS` thresholds, both writing the same two columns, last-writer-wins. Because `vercel.json` is `{}` the analytics sweep has **never been registered**, so `badges.ts` is the de facto owner and `analytics_updated_at` records when the *other* writer last ran — the timestamp lies | 🟠 | **187 of 331 sampled entries mismatch** (prod, drafts-sourced), split perfectly by mode: 5/5 `progressive` pools clean, 5/5 `full_tournament` pools wrong. Read live at `app/pools/page.tsx:95` and `app/dashboard/page.tsx:188`, so two members with identical performance can be shown different levels. Correcting the formula moves **1,048 entries — 817 up, 231 down** | Already fired. Any recalc after an analytics backfill re-flips the column | **Written, not landed.** `badges.ts` now consumes the shared value; migration 026 adds the ratchet; `scripts/reseed-entry-xp.ts` re-seeds silently. All **uncommitted**; 026 **not applied**; reseed **not run** — so prod is unchanged | **Decided 2026-07-26:** levels never demote (ratchet via `everReachedLevel`, mirroring `badge_unlocks`); `total_xp` stays honest; **do not register the analytics-sweep cron** — a second writer is what caused this | *XP has two writers* (🔥 Now) |
| **R14** | **The XP correction's rollout order is load-bearing — now a release constraint, not a code defect.** If `lib/push/badges.ts` deploys **before** migration 026 is applied, its `entry_xp_state` upsert names `highest_level_reached`, which won't exist, and PostgREST rejects the **entire** upsert. ~~The result is never error-checked~~ — **fixed 2026-07-26** (verified): the error is captured, logged loudly, and the function **returns before pushing**, because the snapshot is the diff basis for "what's new" — if it didn't persist, the next run re-derives the same badges and levels as new and pushes them again. Silence is the safe failure. The remaining half is unchanged: if the fix deploys and `scripts/reseed-entry-xp.ts` is **not** run, the first recalc sees the corrected level exceed the stored one and announces it | 🟠 | Now: badge/level pushes go **silent** for every scored pool until 026 is applied — visible in logs, no user-facing wrongness. Still: **~817 level-up pushes** in one burst if the reseed is skipped — a notification event with no sporting cause, which fails the disclosure gate on its face | A `git push` to `master` — **that is a production deploy** — in the wrong order | **Code now fails safe** (`lib/push/badges.ts`, error checked + early return). **Order is still the mitigation** for the rest: apply 026 → deploy → run the reseed **immediately** → re-run `scripts/verify-analytics-parity.ts`. `scripts/reseed-entry-xp.ts:22` states the same order | **Open — Ryan's timing call.** Needs a window where the deploy and the reseed run back to back | *XP has two writers* (🔥 Now) |
| **R15** | ✅ **FIXED IN CODE 2026-07-26 (not deployed) — the performance work had put full-pool analytics on the scoring path.** `lib/push/badges.ts:156` calls `computePoolEntryAnalytics` for the whole pool on every badge run, and badge runs fire from `lib/scoring/recalculate.ts:93` and `:322` on every recalc. That helper called `computeCrowdPredictions` **once per entry** — the exact O(entries × predictions) loop this same session hoisted out of three other call sites, left un-hoisted in the fourth. **Now hoisted** (`lib/analytics/entryAnalytics.ts:201` consensus once, `:223` overlay per entry), matching the other three | 🟠 → 🟢 | Was: 192 entries × 13,385 predictions ≈ **2.6M iterations per recalc** on the largest pool, net-new, on the path with a documented kickoff CPU spike behind it. Now O(n + m); the full-pool prediction pull remains and is inherent to the design | Would have fired on the **first live matchday of the next competition**. Never reached production — the regression and its fix are both in the same unlanded change | **Fixed and verified in code.** The file header, which *claimed* the hoist while the code below did the opposite, is corrected; its STATUS now reads *"LIVE, ON THE SCORING PATH — treat added work here as scoring-path cost"* instead of *"DRAFT, not imported by any live code path"* — the more durable half of the fix | **New — fixed, no decision needed.** Stays on the register until deployed | *⚡ Performance & caching*; *Kickoff write spike* |
| **R16** | **Cross-competition unscoped reads — one deliberate blocker, plus the audit scripts.** `app/api/admin/advance-teams/route.ts:56` reads `matches`, `teams` **and** `match_conduct` tournament-wide with no scope and no pagination. Unscoped `matches` means the advancement cascade would resolve knockout placeholders **across competitions**; unscoped conduct is capped at 1,000 rows. Left unfixed on purpose (blocker comment in-file) because scoping it means threading a tournament id through the cascade — a design change, not a query change. Separately, four `scripts/*.ts` still read the whole conduct table, including `scripts/audit-bonuses.ts:78` — **the recurring end-of-competition bonus audit is itself subject to the truncation it exists to catch** | 🟠 | Wrong advancement and wrong conduct tiebreaks across competitions; a bonus audit that silently passes on partial data. Conduct today = 206 rows; PL 2026/27 adds ~760 → 966; the competition after that crosses 1,000 | Ingesting a **second competition** — the EPL, mid-August. A fixed external date | **13 of 14 app call sites fixed** via `lib/matchConduct.ts` (scoped through the `match_conduct → matches` FK, paginated) — but **uncommitted**, so prod still runs all 14 unscoped. `advance-teams` and the scripts are excluded from that fix | **New — no call made.** Must precede league ingestion (3d in the delivery order) | *⚡ Performance & caching*; *League ingestion*; **R2**, **R5** |
| **R11** | **Dead scoring knobs are editable on mobile.** `bonus_best_player_correct` / `bonus_top_scorer_correct` are read by zero scoring code | 🟢 | A mobile admin can set a value that can never pay out; members see it in the pool's rules | Any admin opening mobile scoring config | Web is honest (greyed *"Coming Soon"*); **mobile is not** (`mobile/app/pool/[id]/scoring-config.tsx:442`) | Covered by the Decision-6 deletion, unimplemented | *Scoring config is internally inconsistent*, defect 4 |

**Why R13 is 🟠 and not 🔴.** It meets the 🔴 wording — it is live and it is misleading users right
now. It is held at 🟠 because the wrongness is confined to a **displayed gamification level**: no
score, rank, points total or record is affected, and nothing is destroyed. Putting it beside "six
pools of predictions are gone" and "an EPL pool scores zero" would dilute what 🔴 means in this
register. That is my judgement, stated so it can be overruled — if the displayed level is considered
part of the product's result surface, it is a 🔴. **Ryan reviewed and did not overrule it
(2026-07-26): 🟠 stands.**

**R14 and R15, on being fixed rather than closed.** Both were raised here on 2026-07-26, verified
against the code by Ryan rather than taken on trust, and fixed the same day. They **stay on the
register**, because nothing is deployed: a defect fixed in an uncommitted working copy is not a
defect that production no longer has. R15 is annotated 🟠 → 🟢 and closes on deploy; R14 changes
*kind* rather than closing — the code now fails safe, so what remains is a **release-ordering
constraint**, and constraints are not fixed by commits.

### The destruction class — four doors to one purge (R1 · R12)

Recorded 2026-07-26. **Provenance matters here and is marked per line:** the schema facts were verified
against the production schema (`pg_constraint`) by Ryan's side and **cannot be re-verified from this
repo**; the route facts below I read in the code myself on 2026-07-26.

**The cascade chain** *(prod schema — inherited, not re-verified here)*: `pool_members` → `pool_entries`
via `pool_entries_member_id_fkey ... ON DELETE CASCADE`. From `pool_entries`, **21 tables** cascade:
`predictions`, `group_predictions`, `special_predictions`, `bracket_picker_knockout_picks`,
`bracket_picker_group_rankings`, `bracket_picker_third_place_rankings`, `entry_round_submissions`,
`match_scores`, `bonus_scores`, `player_scores`, `point_adjustments`, `badge_unlocks`,
`entry_xp_state`, plus **8 `shadow_*` tables**.

| Door | Path | What the application code does | Verified |
|---|---|---|---|
| **1. Self-leave** | `app/api/pools/[pool_id]/leave/route.ts:80-82` | Deletes the `pool_members` row and **nothing else** — the file's only `.delete()`. All destruction is the DB cascade | ✅ read in code 2026-07-26 |
| **2. Admin removes a member** | Direct delete on `pool_members` | Same cascade | Inherited — I did **not** locate the call site in this pass; no file:line asserted |
| **3. Account deletion** | `pool_members_user_id_fkey ... ON DELETE CASCADE` from `users` | Purges that person's entries in **every** pool | Inherited (prod schema) |
| **4. Stop participating** | `app/api/pools/[pool_id]/stop-participating/route.ts:59` | Deletes the caller's `pool_entries` directly; membership row is preserved. Same 21-table cascade | ✅ read in code 2026-07-26 |

**The cascade is known, but undercounted in the code's own documentation.** The comment at
`stop-participating/route.ts:15` reads *"pool_entries has 12 cascade children"* — and the same "12"
is repeated at `:52`. It is now **21**; the `shadow_*` tables were added later and neither comment was
updated. Whoever reasons about blast radius from that comment will be reasoning from a number that is
**43% low**.

**Why this reads worse than R1 in one specific way:** R1 is an admin destroying *other people's* data
and we know it has happened six times. R12 fires on ordinary actions — leaving a pool is a shipped,
member-facing feature — and **nobody has ever counted it**. The absence of an incident count is not
an absence of incidents.

*(Level note: R12 is set 🔴 because the mechanism is live, irreversible, reachable by any user, and
erases a record designed to be permanent. There is an argument that door 1 is consented — the user
did choose to leave — which would pull it down. That argument turns on the open question in Gate A2
and is Ryan's to settle, not mine.)*

### ⚠️ Unverifiable without prod access

Everything above is verified against **code, migrations and git history** unless listed here. These
claims depend on production state and are carried on the authority of the drafts/runbooks that
recorded them — **treat them as unverified, not as done**:

- Whether the survey fixes are actually **deployed** on Vercel (they are on `origin/master`; that is not the same thing) — R8.
- ~~All `sync_settings` flag values~~ — ✅ **resolved 2026-07-26:** `prod_scoring_enabled = true`, `shadow_read_enabled_pools = []`, and `sweep_time_box_enabled` has **no row at all** (V3, V5). `analytics_read_from_columns` remains unread here.
- ~~pg_cron job health, including the shadow **parity alarm** (jobid 21)~~ — ✅ **partly resolved:** the alarm is **working** and has written 849 rows / 418 in 24 h (V2); the earlier "cron failing" note was wrong. The **reconcilers (jobids 19/20)** are still unverified.
- **The six ⬜ analysis claims A1–A6** in *System design* — realtime's share of DB time, pool payload size (3.8 MB vs 12 MB, unreconciled), `max_connections = 60`, whether the admin recalculate button can succeed, whether ingest failures are recorded as healthy, and the count of unbounded `.in()` reads. None are measured; A3 in particular contradicts the recorded XL→Medium downgrade and must be confirmed before any capacity planning.
- Whether **migration 024** was applied (it carries no "applied to prod" header, unlike 025/025b — so almost certainly not) — R2.
- The **RLS policy bodies** behind the delete asymmetry, and the FK cascade definitions behind mobile's `pools` delete — both taken from `drafts/2026-07-21_delete_pool_data_loss.md`, not re-introspected — R1.
- The counts **6 destroyed / 458 exposed**, the audience sizes **477 / 3,652**, and the **~243k pts / 155 entries** inflation measurement — all prod queries from their source drafts.
- Presence of `badge_unlocks` (+ its backfill) and the `trg_enforce_prediction_before_kickoff` trigger.
- **The whole 2026-07-26 performance baseline.** `pg_stat_statements` on `ujthamlehjyubbzxbnes`: 337.5 total DB-hours, `SELECT predictions.*` at 111.3h / **33.0%** / 30.0M calls, realtime WAL decoding 80.9h / 24.0%, `row_to_json(pool_members)` 34.5h / 10.2% at 404–450ms mean, `match_scores` 31.0h / 9.2% — top four = 76.4%. Counter reset date unknown, so these are cumulative-since-unknown, not a rate. Source: `drafts/2026-07-26_performance_optimization_audit.md`.
- **The pool-size distribution the caching strategy rests on** — 623 pools, 4,809 memberships, **median 1 member**, mean 7.7, 70% ≤5, four pools ≥100, max 192; 288,029 predictions across 4,985 entries; 3,184 users in 30d. Every CDN and cache conclusion follows from this table, so if it is wrong the strategy is wrong.
- **The payload measurements** — largest pool 5,420 kB → 3,854 kB after column narrowing (29%), and therefore still over Vercel Runtime Cache's 2 MB item limit — R13/§*Performance & caching*.
- **The parity result and the XP movement** — 187/331 entries mismatched, 5/5 mode split, and 1,048 entries moving (817 up / 231 down) on the corrected formula. All from `npx tsx scripts/verify-analytics-parity.ts` and the reseed dry run against prod; re-runnable, but not from code — **R13**, **R14**.
- **The claim that the scoped conduct read returns identical data** (206 = 206 rows across three query shapes) — verified against prod by Ryan's side on 2026-07-26, not re-verifiable here — **R16**.
- **R12's blast radius — no count exists at all.** How many entries have already been purged by leave / removal / account deletion / stop-participating is **unknown and unmeasured**; it needs a production query (e.g. `pool_membership_events` rows of type `left`/`removed` against surviving entries). The 21-table cascade itself is also prod-schema-verified by Ryan's side, **not** re-verifiable from this repo — only the two route files are.

**Anything not on this list, and not marked unverified inline, was read in the code on 2026-07-26.**

### Known drift, found 2026-07-26, not yet actioned

Recorded so it isn't re-discovered. None of it is a risk; it is the document being wrong about
status, in both directions. Awaiting Ryan's call on what to do with each:

- **Two items are better than written.** *Members' / all predictions after lock* is **shipped**, not "PARTIAL — admin-gated" (`lib/predictions/revealGate.ts` + gated API route + web page + mobile `viewAs=member`, commits `7d14a26` → `f97ca61`). And the *Enhanced super-admin stats* item is accurate — verified.
- **A whole project is missing:** pool status → `lifecycle` + `accepting_members` (migrations 025 + 025b, both recorded prod-applied, plus `3d95e5c` / `3a5fa5e` / `10d555c`) has no item here. It is also what created **R10**.
- **Work sitting in `drafts/` with no item:** `2026-07-25_entry_fee_collection_assessment.md` (a legal/feasibility assessment ending in a recommendation Ryan hasn't ruled on). ✅ *Resolved 2026-07-26 for the caching drafts* — `2026-07-19_caching_infrastructure_plan.md` and the three new `2026-07-26_*` drafts now roll up into *⚡ Performance & caching*.
- **Smaller staleness:** the *Recurring each knockout round* section still reads "SF/Final upcoming" ten days after the final; `analytics_read_from_columns` still appears zero times in code — **re-verified 2026-07-26**, it exists only in `drafts/`, so the M4 note remains accurate; auto round-opening has no code at all (feeds **R5**).

**Found in the 2026-07-26 performance session — three claims the code contradicted. All three raised,
confirmed against the code by Ryan, and closed the same day:**

- ✅ **Migration 026's `current_level` semantics — answered, comment rewritten.** The migration said `current_level` was *"the level implied by current total_xp"* while `lib/analytics/entryAnalytics.ts:236` wrote the **already-ratcheted** level into it. **Ryan's answer 2026-07-26: floored, deliberately.** The comment now states it: `total_xp` honest and may fall · `current_level` **the level to DISPLAY, already ratcheted**, so the simple readers that select it raw (`app/pools/page.tsx:95`, `app/dashboard/page.tsx:188`) get the floor for free and can never show a demotion · `highest_level_reached` the high-water mark producing that floor, equal by construction today, kept separate because the surfaces that recompute level **live** never read `current_level` and need a stored mark to floor against · the raw unfloored level is never stored — always recoverable as `computeLevel(total_xp)`. **Recorded as settled, not open.**
- ✅ **`entryAnalytics.ts` not converted to the split it motivated — fixed.** Hoisted to `computeCrowdConsensus` once above the loop (`lib/analytics/entryAnalytics.ts:201`) + `applyCrowdOverlay` per entry (`:223`), matching the other three call sites. The file header, which claimed the hoist while the code did the opposite, is corrected, and its STATUS changed from *"DRAFT, not imported by any live code path"* to *"LIVE, ON THE SCORING PATH"*. That second half matters more than the first: the stale STATUS is **why** the O(n²) was tolerable to add. See **R15**.
- ✅ **"Shadow has been the sole scorer since the 2026-07-19 cutover" — corrected in the draft.** `drafts/2026-07-26_performance_optimization_audit.md:73-77` now carries an explicit correction note: the read cutover was **rolled back on 2026-07-20** (`prod_scoring_enabled = true`), and `lib/scoring/shadowBrackets.ts` is a bracket **materialiser** whose own header says it never runs on the live per-goal scoring path. The conduct fix stands on its own merits; the severity framing did not. Which engine is scoring is still a live flag value and unverified here (**Gate B**).

**Two remaining unfixed-in-code lines, both of which only close on a release, not a commit:** the
deploy ordering (**R14** — the code now fails safe, the ordering constraint stands) and the fact that
none of it is applied or deployed.

---

## 🧭 Order of deliveries — **proposed**

> **Proposed, not committed.** This is a recommendation for Ryan, derived from what this document
> already records — the dependency chain, the risk levels, the prioritisation rule below, and the
> settled decisions. He has agreed none of it.
>
> **No dates.** The only fixed external date in this programme is the **EPL season start**. Everything
> else is ordered relative to what it depends on, never to a calendar. Effort remains
> order-of-magnitude, never a commitment.

**Rule applied:** anything that *silently produces wrong data* outranks anything merely missing; then
`(blast radius × likelihood) ÷ effort` for defects and `(what it unlocks) ÷ effort` for features.
Where two items are genuinely interchangeable, that is stated rather than resolved into a fake order.

### The sequence

**0 · Send or drop the feedback survey** `Ops` — **R8**, independent of everything below.
Not a dependency of anything; it sits first only because its value decays and it is already past its
own time box. The written blocker has cleared (all four commits are on `origin/master`); what remains
is confirming the deploy is live, which is prod state this document cannot verify.

**1 · Stop the irreversible deletion paths** `Bug` `Data-loss` — **R1** *(2 doors)* + **R12**
*(4 doors)*.
First because this is the only place in the programme where the loss is **already happening and
cannot be undone** — everything else below produces wrong numbers, which can be recomputed.
The two halves are **not** equally actionable, and that difference drives the order inside this step:

- **R1 has a cheap interim available now** — drop the policy (web) and remove the mobile button. Six
  pools destroyed, 458 one tap away, and it is the lowest-effort mitigation in the register.
- **R12 has no interim identified.** The destruction is a schema property, not application logic —
  three of its four doors contain no delete of entries or predictions in code at all. There is no
  button to remove and no policy to drop; anything real here is a schema change (soft-delete,
  retention, or re-pointed FKs), and its *shape* depends on Gate A2 below.
- **Counting first is cheap and unblocked.** R12's blast radius is unknown because nobody has
  queried it. That query needs no decision from anyone and would tell us whether this is a live wound
  or a latent one — which is exactly what the level and the urgency turn on.

> **🚦 Gate A — what does "archive" mean, given 025b?**
> The *interim* close does not wait on this. The **durable** fix does: Decision 7 says *archive, not
> delete*, but migration 025b constrains `pools.status` to `('open','completed')`, so a reversible
> archive needs either another migration or a ruling that archive **is** `completed` (**R10**).
> Until Ryan rules, the replacement cannot be specified — only the interim can proceed.

> **🚦 Gate A2 — what should leaving a pool do to a member's history?** *(new 2026-07-26)*
> **Gate A does not cover this**, and that is the point: Gate A is about a *pool* ending, A2 is about a
> *person* exiting one that continues. Ryan's stated direction is that entries should not be purged
> on exit; the direction does not yet say what replaces it, and the options differ enough that the
> fix cannot be specified without an answer — soft-delete the entry, retain it and only hide it from
> the leaderboard, or retain the history while releasing the seat. Each implies a different schema
> change, a different answer for what the leaderboard shows afterwards, and a different position on
> whether a departed member's picks stay visible to the pool.
> Two sub-questions ride on it, both currently unanswered:
> **(a)** does self-leave count as consent to erasure, where admin-removal and account-deletion
> plainly do not? **(b)** does account deletion — a likely privacy/erasure obligation — need a
> *different* answer from the other three doors?
> **Surfaced, not answered.** Until this is ruled, R12 has no specifiable fix and stays open.

**2 · Collapse the scoring defaults to one constant** `Scoring` — **R3** (carries **R11**).
Before anything that consumes scoring, because one admin click rescales a live pool ~20×, the answer
is already settled (Decision 6: 100/75/50 canonical), and it is ~half a day. **Also a Showdown
dependency:** Decision 6 states comparable scoring across pools is *a hard prerequisite for
Showdown* — so this precedes Showdown, not merely the backlog.
*Genuinely close to #1.* Both are one user action away and both are cheap; #1 goes first only because
its damage cannot be undone, where a rescale can.

**2b · Land the XP-ownership correction** `Bug` `Scoring` — **R13**, carrying **R14**.
*Added 2026-07-26. Numbered 2b so the existing cross-references to "#2" still mean the scoring
defaults.* Placed here by the same rule: it silently produces wrong data (the level shown on
`/pools` and `/dashboard` depends on which writer ran last), and the fix is **already written and
tested** — 157/157 pass — so `(blast radius × likelihood) ÷ effort` puts it near the top on a
denominator close to zero. What remains is not engineering, it is a **release**: apply migration
026 → deploy → run `scripts/reseed-entry-xp.ts` immediately → re-run
`scripts/verify-analytics-parity.ts`. **The order is not optional** (R14): deploying before the
migration silently breaks every `entry_xp_state` write, and skipping the reseed fires ~817 level-up
pushes at once. It also unblocks step 6's analytics read flip, which parity currently fails.

> **🚦 Gate B — which engine scores the EPL?**
> Must be answered **before** league scoring is designed, because the same fix lands in a different
> codebase depending on the answer: the Node engine (`lib/scoring/*`) or the shadow engine's SQL.
> ✅ **The factual half is now answered (2026-07-26, V5):** `prod_scoring_enabled = true` and
> `shadow_read_enabled_pools = []` — the **prod Node engine is scoring everything**, shadow reads are
> fully off. The gate is no longer *"what is running?"* but purely **"which engine should own the
> EPL?"** — Ryan's call, still open. Related but **not** an EPL gate: shadow still carries the pre-fix
> podium logic (**R4**) — a league has no podium, so that blocks any *re-cutover* or any future cup,
> not the EPL itself, and with reads off that divergence is **latent**.

**3 · The league critical path** `Multi-sport` — **R2**, then **R5**. In dependency order:

| Step | Why it must come where it is |
|---|---|
| **3a.** A `regular_season` path through the scoring gate **and the price lookup** | Everything downstream is meaningless without it — a league pool that ingests perfectly still scores nothing. |
| **3b.** Decide the bonus story (build a league bonus path, or ship match-points-only) | `calculateGroupStandingsBonuses` iterates 12 hardcoded groups; a league has none, so today there is no bonus path at all. This is a **scope option for Ryan**, recorded here, not chosen here. |
| **3c.** Multi-tenant sync — read competition config off the tournament row | Until this lands, the competition *is* three env globals (`sync-fixtures/route.ts:67`); 024 backfills the columns it needs. |
| **3d.** Apply migration 024 + land the importer | Deliberately **after** 3a. 024 staying uncommitted is currently the only thing preventing a zero-scoring league pool from being creatable at all — both create-pool wizards list tournaments unfiltered, so the `tournaments` row *is* the trigger. Landing the importer first would open that door before scoring can hold it. |
| **3e.** Matchweek deadlines + **auto round-opening** | Decision 7: *"a prerequisite, not polish"* — the progressive World Cup needed super-admin bulk updates for 7 rounds; the EPL is 38 matchweeks × every pool. |
| **3f.** Competition-appropriate round labels | Existing item; wording is WC-only today ("Round of 16" vs "Match Week 3"). Cosmetic relative to 3a–3e, so last in the block. |

> **🚦 Gate C — scope, or date?**
> **R5's position stands: mid-August is not reachable on these foundations.** For it to become
> reachable, all of 3a, 3c, 3d and a workable answer to 3e would have to be true, with 3b scoped down.
> A **minimum viable league pool**, as this document describes one, is: fixtures ingested (024 +
> importer) · a scoring path that prices a regular-season fixture (3a) · per-matchweek deadlines and
> some way to open them (3e, automated *or* explicitly accepted as manual ops) · one canonical scoring
> scale (#2). The open scope levers are **bonuses in v1 or not** (3b) and **automated vs manual
> round-opening** (3e). Which lever moves — or whether the date moves instead — is Ryan's call, and
> nothing below it can be sequenced until he makes it.

**4 · Empty-bracket bonus gate** `Scoring` — **R6**, accepted-but-due.
*Order genuinely ambiguous, deliberately not resolved:* the condition Ryan set was "before the next
competition". If the next competition is the **EPL**, a league has no group standings, so this can
follow the league path without harm. If any **cup** competition comes first, it must precede it. The
ordering depends on a fact only Ryan holds — what actually runs next.

**5 · Showdown** `Feature` — gated by #2 (comparable scoring, Decision 6) and by the EPL season
existing at all. *Avatars v1* gates matchup-card personalisation; *Showdown notifications* is recorded
as launch-critical for it. Nothing in Showdown can start meaningfully before Gate C is answered.

**6 · Leaderboard precompute (M4 read-path flip) + Phase D** `Infra`.
Positioned here, not earlier, because it is a **scale** dependency rather than a correctness one — the
XL→Medium item records Phase D as *"what keeps Medium comfortable at Showdown/EPL scale"*. It should
precede EPL/Showdown **traffic**, not EPL **correctness**.

**Unsequenced, and deliberately so:**

- **R7 — instrument admin churn.** Not silent-wrongness class, so the rule ranks it below everything
  above; but its measurement window (the WC→EPL transition) is open **now** and closes at EPL start.
  It genuinely competes with #3 for attention, and that trade is Ryan's, not a sequencing fact.
- **R9 — move the repo off iCloud.** ~1 hour, no dependencies, competes with nothing. Worth doing
  before any long build-and-commit stretch, since it can flip bytes in tracked source.
- **R16 — `advance-teams` multi-competition scoping.** Not sequenced against the risks above, but it
  **is** sequenced inside step 3: it has to precede **3d** (apply 024 + land the importer), because
  the first thing a second `tournaments` row does is make that route cross-competition.
- ~~**R15 — the analytics-on-scoring-path regression.**~~ ✅ **Fixed in code 2026-07-26**, before it
  ever reached production. Nothing to sequence; it ships with the rest of the unlanded change.
- The **Known drift** items above (a missing project, two stale statuses, untracked drafts) — awaiting
  Ryan's call on each; none of them block delivery.

### Dependencies this ordering surfaced that no item currently states

Recorded here because deriving the sequence exposed them; the items themselves have **not** been
edited to add them.

1. **R3 is a Showdown dependency, not just a defect.** Decision 6 makes comparable scoring a hard
   prerequisite for Showdown, but the *Scoring config is internally inconsistent* item never says so.
2. **Leaderboard precompute is an EPL/Showdown scale dependency.** The XL→Medium item says Phase D is
   what keeps Medium comfortable at that scale; the *Leaderboard precompute* item itself frames the
   work only as a June-outage fix.
3. **R6's position depends on which competition runs next**, because a league has no group standings —
   the item's "before the next competition" condition is ambiguous in a multi-sport world, and nothing
   in the document resolves it.
4. **Crews (Decision 1) are in direct tension with the cascade (R12).** Decision 1 settles that a crew
   *"keeps history — all-time record, past seasons, rivalries"* and that removal means *"stops getting
   invited, not erased"*. The schema does the opposite today: exit erases. Recorded as a surfaced
   conflict, **not** a challenge to Decision 1 — the decision stands; it is the implementation that
   contradicts it, and Gate A2 is where that gets reconciled.

---

## 🏗️ System design — today, and where it should go

> Added 2026-07-26 from two research workflows (15 agents). **Provenance is marked on every claim and
> is not negotiable:** ✅ **verified** means checked against production or read in the code on
> 2026-07-26 · ⬜ **analysis** means a workflow's reasoning that nobody has measured. A design opinion
> is not a fact, and this section keeps them apart on purpose. Nothing here is a decision.

### The goal, as four testable properties

Ryan's statement of the product: *"an office pool product that makes it easy for admins to run their
pools, always shows 100% accurate scores, and gives a real-time live leaderboard."* The research split
that into four properties, because **"accurate" and "live" are different things with different
owners** — and a goal you can't test is an aspiration.

| # | Property | Proposed invariant / metric ⬜ |
|---|---|---|
| **P1** | **Correctness** — every number is reproducible from source facts and reconciles to its own line items | For every entry: `scored_total_points == Σmatch_scores + Σbonus_scores + point_adjustment`. Zero exceptions, checked continuously, not at incident time |
| **P2** | **Freshness** — staleness is *bounded, measured and visible*, split by owner: **ingest lag** (reality→DB, provider-governed) and **fan-out lag** (DB→screen, entirely ours) | Two separate numbers, each with a stated budget. Conflating them hides which half is broken |
| **P3** | **Admin operability** — an admin can answer *"is it working?"* and *"why is this number what it is?"* without an engineer | Every displayed total is drillable to its line items; every automated job exposes last-success and lag |
| **P4** | **Multi-competition capacity** — N competitions run concurrently with **no per-competition deploy** | Competition config lives in data, not env vars or code branches |

These four are the spine of everything below, and they map onto the register: P1 ↔ R17/R3/R6, P2 ↔ the
fan-out work, P3 ↔ R18, P4 ↔ R2/R5.

### ✅ Verified against production, 2026-07-26

State these as fact.

| # | Finding | Why it matters |
|---|---|---|
| **V1** | **The ledger does not reconcile to itself.** Of 4,985 entries, **29 mismatch** `scored_total_points` vs `Σmatch_scores + Σbonus_scores + point_adjustment`: **26 show MORE than earned (149,525 pts over)**, 3 show LESS (4,975 under), **3 carry points with zero line items**. Max single delta **9,825** | A direct **P1** violation, live. **This does not contradict the 2026-07-21 ledger audit** — that audit asked *"is anyone owed points?"* and was essentially right. This asks *"does the total reconcile to its evidence?"*, which is a different question it never posed. Now **R17** |
| **V2** | **The parity alarm is alive and unconsumed.** `shadow_score_diffs` holds **849 rows, 418 in the last 24 h**, newest 2026-07-26 17:45, across 3 distinct `diff_kind` values | It has been detecting discrepancies all day into a table **nothing reads**. **Corrects** the earlier note that the alarm cron was failing — it isn't; the consumer is. A **P3** failure. Now **R18** |
| **V3** | **`sweep_time_box_enabled` has no row in `sync_settings`** — absent, not `false`. The flag read returns undefined, so the time-boxed resumable sweep never engages and the lock TTL stays 600 s | Other flags exist as explicit `true`, so this looks **never inserted** rather than deliberately disabled. The *XL→Medium* item calls this "the last flag to flip"; it cannot be flipped, only created |
| **V4** | **`pool_entries` is in the `supabase_realtime` publication**, alongside `matches`, `pool_members`, `pool_round_states`, `user_activity`, `user_presence` and four more | Every scoring UPDATE writes WAL that is then **RLS-evaluated per subscriber**. This is the mechanism behind the fan-out cost in A1 below |
| **V5** | **Gate B's factual half is answered:** `prod_scoring_enabled = true`, `shadow_read_enabled_pools = []` | The **prod Node engine is scoring everything**; shadow reads are fully off. **R4's divergence is therefore latent, not live.** It does **not** decide which engine *should* score the EPL — still Ryan's call — but the uncertainty that question rested on is gone |
| **V6** | **Zero `stage='regular_season'` rows exist in production** | **R2 is prospective, not live** — materially better than the register implied. The risk level is unchanged because the trigger is still one `tournaments` row away |
| **V7** | **Migration 024 is not applied** (expected — deliberately uncommitted). **Migration 026 is also not applied** — `entry_xp_state.highest_level_reached` does not exist | 024 is the R2 safety catch working as intended. 026 is an unexplained gap: a migration that exists and has not landed |

### ✅ Verified in code, 2026-07-26 (mine, this pass)

| Finding | Evidence |
|---|---|
| The web pool page polls **every 30 s via `router.refresh()`**, layered *on top of* an existing realtime subscription | `app/pools/[pool_id]/PoolDetail.tsx:666`. It is gated on the active tab (`:663-664`, four tabs) but has **no visibility check and no jitter** — a backgrounded tab keeps refreshing, and every client fires on the same wall-clock phase |
| **Mobile has no query cache at all** | No `react-query` / `@tanstack` / `swr` in `mobile/package.json` |
| **No caller ever passes `strict`** to the api-football client | `strict` appears only at `lib/integrations/apiFootball/client.ts:59,73` and `types.ts:65` — zero call sites set it. The *mechanism* for silent failure is therefore real; whether a failed fetch is then **recorded as a healthy run** is the unverified half (see A5) |
| `recalculate_all_pool_points` is **called from** `app/pools/[pool_id]/admin/ScoringTab.tsx` | The function body lives in the database, **not in this repo** — so the claim that it INSERTs non-existent columns (A4) cannot be settled from here |

### ⬜ Analysis, not measurement — do not treat as fact

Recorded because it is decision-relevant, flagged because nobody has measured it.

| # | Claim ⬜ | What would settle it |
|---|---|---|
| **A1** | **Realtime is ~25.6% of all DB time**, with `realtime.apply_rls` alone ~18.6%. If true, the kickoff spike's real cost was **fan-out, not scoring writes**, and the highest-leverage single change is removing high-churn tables from the publication — reusing the **Broadcast-from-database** pattern migration `022` already established for banter | `pg_stat_statements` by total time. The percentages are unverified |
| **A2** | **The two workflows disagree on pool payload size: ~3.8 MB vs ~12 MB** (the latter claiming `match_scores` alone is ~10 MB for the largest pool) | Measure one large pool's response. **This matters beyond curiosity:** the recorded caching decision was taken on the 3.8 MB figure, so if it is really 12 MB, that decision rests on a wrong number |
| **A3** | **`max_connections = 60`**, which would mean the instance is **not** Medium (Medium is 120) | Supabase dashboard. **Contradicts the recorded XL→Medium downgrade.** Confirm before any capacity planning — it changes the arithmetic on everything downstream |
| **A4** | **The admin "Recalculate points" button cannot succeed** — `recalculate_all_pool_points` allegedly INSERTs columns that don't exist on `match_scores` | Introspect the function body in the DB. If true this is a **P3** failure and belongs in the register as its own risk; flagged for verification, **not** recorded as broken |
| **A5** | **api-football errors are swallowed** — with `strict` never passed, failures return an empty envelope and are recorded as **healthy runs**, making mean-time-to-notice for an ingest stall unbounded | The `strict` half is verified above; what remains is whether the sync route writes a success record on an empty envelope |
| **A6** | **~96 unbounded `.in()` reads** across `app/`, `lib/`, `mobile/`, against the 1,000-row PostgREST cap | My raw grep finds **199** `.in(` call sites in total (bounded and unbounded together), and the existing *Bounded reads* item records a 2026-07-10 sweep of 161 web + 30 mobile. **Three different numbers, none reconciled** — re-run the sweep with one definition before quoting any of them |

### ⬜ Proposed direction

Where the design should go. All of it is proposal.

- **Precompute over cache.** The only genuinely *shared* object in this product is the **competition**, not the pool — the median pool has very few members, so a per-pool cache has almost nothing to amortise. Cache less than instinct suggests; precompute more.
- **Move fan-out off WAL-plus-RLS** for high-churn tables, using the Broadcast-from-database pattern already proven in migration `022`. Contingent on **A1** being true (V4 establishes the mechanism; A1 is the size of it).
- **The largest available wins are client-side, not server-side** — a visibility-gated, jittered poll on web, and a query cache on mobile. Both are cheap and neither needs a schema change.
- **Split the freshness budget in two (P2)** and show both numbers to admins (P3), so "is it working?" has an answer that doesn't require an engineer.

### ⬜ Not yet — and the trigger

Each classic building block that was rejected, why it's wrong *for this product today*, and the
number that would change the answer. This is the part that keeps its value as the product grows.

| Block | Why not today ⬜ | Trigger that reopens it |
|---|---|---|
| **Load balancer** | Nothing to design — Vercel's anycast layer already provides ingress, autoscaling and failover | Leaving Vercel |
| **Sharding** | Adds cross-shard complexity to a dataset that is small and cleanly pool-scoped | A single competition's `match_scores` exceeding what one Postgres instance serves comfortably, **or** write throughput that vertical scaling can no longer absorb |
| **CDN for pool detail** | Responses are per-member and carry `set-cookie`, so the platform won't cache them anyway; median pool size means ~0% hit rate | Never for pool detail. CDN stays right for **static assets, marketing, `/play/*`, `/tv/*`** — genuinely shared content |
| **Redis / external cache** | A second consistency boundary to keep honest, for an object that is barely shared | A measured, repeated read that precompute cannot serve — e.g. leaderboard ZSETs at a scale precompute can't hold |

### How this section touches the rest of the programme

Cross-references, not duplicates. **P1** ↔ **R17**, **R3**, **R6** · **P2** ↔ the fan-out work and
A1 · **P3** ↔ **R18**, A4 · **P4** ↔ **R2**, **R5**, and *Sync cron is single-tenant*. V5 answers the
factual half of **Gate B**; V6 re-characterises **R2**; V3 corrects the *XL→Medium* item's "last flag
to flip". **Decision 6** (one canonical scale) and **Decision 7** (platform as referee, admin
operability) are the product-side statements of P1 and P3 respectively.

**Where the design assumes an unanswered gate:** the precompute-over-cache direction assumes the
competition is the shared object — which is only true once **P4** exists, and P4 is gated by **Gate C**
(EPL scope-or-date). Sequencing this work before Gate C is answered risks precomputing the wrong shape.

> **🚦 Gate D — "real-time live leaderboard" vs "minute-cadence is sufficient"** *(new 2026-07-26)*
> The stated goal says **real-time live leaderboard**. A recorded product principle says
> **"predictions app, not a score tracker — minute-cadence live updates are sufficient; don't
> over-engineer real-time score fidelity."** Both are Ryan's. They point at different systems: one
> justifies pushing every scoring change to every viewer, the other justifies bounded, cheap polling
> — and **A1 suggests the difference is a large share of the database bill.**
> This is not a contradiction to resolve by picking the newer statement; it is a genuine product
> question about what "live" has to *feel* like on a match night. **Surfaced, not answered.** Until
> it is, P2's freshness budget has no target number to be measured against.

---

## 🧮 Scoring engines — the register, and the rule they all follow

> **Added 2026-07-29 on Ryan's instruction.** Two things live here: the RULE that
> settles how scoring works from now on, and a REGISTER of the engines that
> implement it. There is more than one engine already and there will be more —
> the league engine is next — so what each one is FOR has to be written down
> rather than inferred from the code.

### The rule — settled 2026-07-29

**The backend computes every score and every derived statistic ONCE, when
something changes, and writes the answer down. Every front end — web and
mobile — reads those rows and renders them. Clients compute nothing.**

This is not a performance preference; it is the architecture. It was arrived at
the hard way: the leaderboard shipped 26,770 rows to every viewer so each browser
could re-derive ten numbers per entry that the scoring path had already worked
out. Consequences that follow from the rule, and are not up for re-litigation per
surface:

- **A number a member sees must exist as a stored value**, not as something a
  screen worked out. If a screen needs a number, the question is "where is it
  stored", not "how do I compute it here".
- **An aggregate over a pool is computed in SQL**, not by shipping the raw rows
  and reducing them in JavaScript. See migrations 038/039 for the shape.
- **The same stored value feeds web and mobile.** Two surfaces deriving the same
  number independently is how they came to disagree about levels
  (fixed 2026-07-29) — the bug is structural, not a slip.
- **Live updates are pushed, not polled.** One broadcast per pool per scoring
  pass, carrying the changed rows.

### The register

| Engine | What it does | What it is FOR | State |
|---|---|---|---|
| **Node "prod" engine** — `lib/scoring/core.ts`, `lib/scoring/recalculate.ts` | Pull-Compute-Push: reads a pool's rows into Node, scores in JS, writes back | The original engine. Now a running safety net behind `prod_scoring_enabled` | ✅ live, still enabled. Retires only after the parity alarm is clean across a full cycle AND podium ownership moves into SQL |
| **Shadow engine** — `shadow_*` SQL functions + `shadow_*` tables | Set-based, DB-native scoring: `shadow_score_match`, `shadow_finalize_totals`, rank snapshot, reconcilers (jobid 19/20), diff alarm (jobid 21) | Replacing the Node engine. Covers full_tournament, progressive and bracket_picker | ✅ live and is the READ SOURCE for **all 623 pools** since 2026-07-29 |
| **Analytics / XP writer** — `lib/analytics/entryAnalytics.ts`, called by `lib/push/badges.ts` | Computes and stores hit rate, exact count, streak, last-five, crowd stats, XP and the ratcheted level into `entry_xp_state` | The per-entry statistics every surface reads instead of deriving | ✅ live, on the scoring path. ⚠ implements 11 of 12 badges — skips `dark_horse` |
| **Per-match aggregates** — migrations 038/039, `pool_match_prediction_accuracy()` | Counts, per match: how the pool split home/draw/away, how many were right, the most popular scoreline | Any pool-wide aggregate a screen needs — Matchday Pulse, Form's crowd section | ✅ live. Takes `p_submitted_only` because its two callers count different populations |
| **Podium** — `lib/podium.ts` | Derives the actual and predicted tournament podium | Champion / runner-up / third bonuses | ✅ live in Node. **Must move to SQL before the Node engine can retire** |
| **Bracket-picker provisional** — `lib/bracketPickerScoring.ts` | Client-side scoring of bracket picks for live display | Provisional standings before official scoring lands | ⚠️ still computed in the browser — the last real violation of the rule above |
| **League engine** | — | Premier League and other league competitions | 🔵 **NOT BUILT — next.** ⚠️ A league pool currently scores **ZERO silently**: the group/knockout binary is baked into the scoring price lookup, not just the gate. See *League ingestion* |

### Why the register exists

The engines are not variations on one thing. They disagree about what a "point"
is, which competitions they understand, and which of them owns a given number.
Two concrete cases already cost real time:

- `point_adjustment` reached shadow for every mode **except** bracket_picker,
  because a guard written when bracket_picker was out of scope was never
  revisited. One member's 223 points silently vanished (fixed 2026-07-29).
- XP had **two** writers with different formulas racing on one column; the level
  shown depended on which ran last (fixed 2026-07-26).

Both were "which engine owns this?" questions that nothing wrote down. Adding an
engine without adding its row here is how the next one happens.

---

## ✅ Recently shipped

> Completed and deployed to production. Kept here for visibility, then pruned once it's old news.

### Podium bonus remediation `Scoring` `Bug` — SHIPPED 2026-07-21
> Added 2026-07-26. This incident and its remediation were **missing from this document entirely** —
> the largest scoring correction the product has run, absent from the single source of truth. R4
> depends on it.
- **What broke:** the tournament podium was scored off `tournament_awards` (empty) plus, in progressive, a phantom cascaded bracket. **669 podium bonus rows / ~324,375 pts owed**, concentrated in **~73 pools**; 50 saw rank changes and **13 changed their #1**. `full_tournament` was always correct.
- **What shipped:** `lib/podium.ts` is now the single owner — `resolveActualPodium()` derives the podium from the completed final / third-place matches with `tournament_awards` demoted to an optional admin override, and `resolveEntryPodiumPick()` dispatches on a **required** mode discriminant (no default). Commit `ea8d9da`, deployed, then a full re-score over all **524 classic pools**. Final audit `ADD=0 / REMOVE=0` on all six lines. Rollback snapshots `_podium_before_20260721` / `_pool_entries_before_20260721` left in place.
- **Landed with no comms, by decision.** Runbook + full evidence: `drafts/2026-07-21_podium_remediation_runbook.md`. Re-audit with `npx tsx scripts/audit-podium.ts`.
- ⚠️ **Two live consequences:** (1) the shadow engine still carries the **pre-fix** podium logic — see *Shadow scoring engine* and **R4**; (2) the re-score is what *surfaced* the Delete Pool data loss (one pool's predictions had already been destroyed, so 26 members correctly zeroed and were restored from snapshot) — see **R1**.
- **Lesson worth keeping:** prod↔shadow parity was blind to this, because shadow carried a hand-fork of the same bug. Parity between two implementations is not an oracle; validate against the domain.

### HTTP security headers + security.txt `Infra` — SHIPPED 2026-07-11
- **What:** production HTTP hardening in `next.config.ts` `headers()` — `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=()/microphone=()/geolocation=()` on all routes; `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on everything except `/tv/*` (frame-exempt via `/((?!tv/).*)`); plus a `security.txt`. Commit `d6d6042`, verified live on sportpool.io.
- **Watch for:** new embeddable surfaces must be added to the `/tv/*` negative-lookahead or they'll be frame-denied; `camera=()` will silently block future in-app photo *capture* (Avatars) until `camera=(self)` is allowed.

---

## 🔥 Now — active, can't wait

### "Delete Pool" destroys every member's predictions `Bug` `Data-loss` 🔥
- **Is:** `app/pools/[pool_id]/admin/SettingsTab.tsx:232-302` runs five un-transactional PostgREST deletes from the **browser**, predictions first. An RLS asymmetry makes it catastrophic: `predictions` DELETE is `is_pool_admin(pool_id)` (an admin can delete **everyone's**) while `pool_entries` has **no** admin DELETE policy, so step 2 silently deletes only the admin's own entry and **returns no error**. Any abort after step 1 leaves the pool alive with every member's predictions gone.
- **Impact:** **6 pools / 41 entries already destroyed**, the earliest in June — this has been happening quietly for weeks. **458 pools with an admin are one click away.** Risk is elevated post-tournament, when people tidy up pools.
- ⚠️ **There is a second door, on mobile (added 2026-07-26).** `mobile/components/pool-detail/SettingsTab.tsx:222` runs its own `supabase.from('pools').delete().eq('pool_id', …)` — a different shape (one statement, relying on FK cascades) reached from the same admin Settings screen. It is **not** covered by the zero-deploy mitigation below, and "remove Delete Pool from admins entirely" is therefore **two** removals, not one. Whether the cascade completes or errors depends on FK definitions that are prod state — unverified.
- **Also:** `app/api/account/delete/route.ts` deletes predictions/entries/memberships across all pools at lines 33-85, then only checks "are you still a pool admin?" at line 90 — a pool owner who tries to delete their account keeps the account and loses everything everywhere.
- **Zero-deploy mitigation (verified safe, policy has one consumer):** `drop policy "Pool admins can delete predictions" on predictions;` → the **web** button then fails loudly having destroyed nothing. It does not touch the mobile path, which deletes `pools` rather than `predictions`.
- **Proper fix:** server-side transactional delete (single Postgres function / soft-delete), move the account-delete guard to the top, add real `ON DELETE CASCADE`, and an alarm for non-`bracket_picker` pools with submitted entries but zero predictions.
- **Detail + full evidence:** `drafts/2026-07-21_delete_pool_data_loss.md`
- **Decision 2026-07-25:** the fix is **archive, not delete** — Delete Pool is removed from admins entirely, replaced with a reversible archive that keeps history; true deletion becomes a support action. Rationale: it destroys *other people's* data irreversibly on one person's tap, and once Crews keep history (*Project: Multi-sport platform → Decision 1*) it erases part of the crew's permanent record for everyone in it.
- **Status:** documented only, by decision 2026-07-21. **Not mitigated — still live.**

### Post-tournament feedback surveys — send them `Ops` ⏳
- **Is:** the two survey emails to pool admins (477) and non-admin players (3,652). Ready to fire, and time-boxed — the plan was "within ~1 week of the final."
- **Prep done 2026-07-21:** three blockers found and fixed, none of them visible from the "✅ built" status this item carried. **(a)** Every segment in `lib/email/segments.ts` silently truncated at PostgREST's 1,000-row cap — the player survey resolved to **146 recipients out of 3,958**, and a dry run would have reported that as the audience. Now paged via `fetchAll()` (all 15 segments, not just these two). **(b)** Both Tally forms were still **DRAFT** — every CTA 404'd. Published, and the "Anything else?" box that was marked required despite reading "Optional." is now optional. **(c)** No `maxDuration` on a ~41-batch send whose idempotency key is written *before* the first email; now `300` with 600 ms inter-batch pacing.
- **Also:** new `past_predictors_non_admin` segment so the 306 admin-and-player people get the admin survey only, never two emails. By decision, **no Resend topic** is attached — maximum reach, so per-category opt-outs aren't honored on these two sends.
- **Touches:** `lib/email/segments.ts`, `app/api/admin/send-template/route.ts`, `scripts/preflight-feedback-survey.ts`, super-admin **Templates** tab.
- ⚠️ **Blocker corrected 2026-07-26 — "the fix is local" is no longer true.** All four commits are on `origin/master` (`a5cdf0e` paging, `68a48ec` branding, `bb50f5d` runbook, `71e0a44` sender), pushed 2026-07-25; the only unpushed commit on `master` is `a1e1ef4`. The original hazard still stands in principle — the Templates tab runs against prod, so sending *before* the deploy is live resolves the old truncated audience **and** burns the idempotency key — but the remaining question is now **"is the deploy live?"**, which is prod state and unverified here, not "has the code been written?". Check the deploy, then send.
- ⏰ **Past its time box:** the stated window was "within ~1 week of the final" (16 Jul), i.e. ~23 Jul. Every further day costs response quality. See **R8**.
- **Runbook:** `drafts/2026-07-21_feedback_survey_send_runbook.md` — pre-flight, expected counts, and partial-send recovery.
- **Done when:** `npx tsx scripts/preflight-feedback-survey.ts` passes, both sends report 477/477 and 3,652/3,652, and responses are landing in Tally.

### Scoring config is internally inconsistent `Bug` `Scoring` 🔥
- **Is:** four defects in the pool-scoring settings, all verified in code 2026-07-25.
  1. **Three default sets disagree.** `app/api/pools/create/route.ts:5` gives new pools `group_exact_score: 100`; the engine fallback (`app/pools/[pool_id]/results/points.ts:69`) and the admin **Reset to defaults** button (`app/pools/[pool_id]/admin/ScoringTab.tsx:21`) both say `5`. **Pressing reset on a live pool rescales it ~20×** while leaving `bonus_champion_correct` at 1000 — turning the champion pick from ~10 group matches into ~200, and the other 103 fixtures into decoration.
  2. **The reset ladder is non-monotonic** — r16 `2`, QF `3`, **SF `2`**, 3rd `1.5`, final `3`. One click makes a semi-final worth less than a quarter-final.
  3. **`round_32_multiplier` is missing** from `SCORING_DEFAULTS` entirely — every new pool's first knockout round is priced by an unexamined column default.
  4. **Two settings are stored, editable, and read by zero scoring code** — `bonus_best_player_correct` / `bonus_top_scorer_correct`. **Web is honest about it:** they sit under a greyed *"Coming Soon"* header (`ScoringRulesTab.tsx:375`). **Mobile is not:** `mobile/app/pool/[id]/scoring-config.tsx:442` renders them as ordinary editable `PointsField`s alongside the working bonuses, so a mobile admin can set a value that will never pay out. *(Corrected 2026-07-25 — an earlier version of this item overstated the web case.)*
- **Decision 2026-07-25:** **100/75/50 is canonical** — collapse to one exported constant. **Delete** the two dead bonuses from the UI and defaults. Fix the ladder's monotonicity and add `round_32_multiplier`. Longer term these are replaced by named presets (*Project: Multi-sport platform → Decision 6*).
- **Touches:** `app/api/pools/create/route.ts`, `app/pools/[pool_id]/results/points.ts`, `app/pools/[pool_id]/admin/ScoringTab.tsx`, `app/pools/[pool_id]/ScoringRulesTab.tsx`, `app/api/admin/branded-pools/route.ts`.
- **Effort:** ~half a day for 1–4; presets are a separate, larger piece.
- **Done when:** one constant defines defaults for every consumer, reset is non-destructive, the multiplier ladder is monotonic and validated on save, and no member-visible rule is unreachable by the scoring engine.

### XP has two writers — the level shown to users is whichever ran last `Bug` `Scoring` 🔥
> Added 2026-07-26 from the analytics read-path parity pass. **R13** (the bug) and **R14** (the
> rollout order). The fix is written and tested; **nothing is applied or deployed**, so this is live.
- **Is:** `entry_xp_state.total_xp` / `.current_level` were written by two independent paths computing **different quantities**, both compared against the same `LEVELS.xpRequired` thresholds, last-writer-wins. `lib/push/badges.ts` (pre-fix, old line 400) wrote `Σ match_scores.total_points + badgeXP` — **scoring points**. `lib/analytics/entryAnalytics.ts` writes `computeFullXPBreakdown` XP — `BASE_XP[tier] × STAGE_MULTIPLIERS` + crowd/streak bonus events + badge XP. Not two implementations of one formula; two formulas.
- **Already user-facing.** `app/pools/page.tsx:95` and `app/dashboard/page.tsx:188` both read `current_level` and show it on pool cards. Two members with identical performance can be shown different levels depending only on whether their pool was recalculated after the last analytics backfill.
- **Evidence (prod, drafts-sourced):** `scripts/verify-analytics-parity.ts` → **187 of 331 entries mismatched**, split perfectly by mode (5/5 `progressive` clean, 5/5 `full_tournament` wrong). Proof it is Writer A's formula: `stored − Σ match_points` yields a clean badge residual, and two entries with the identical badge set both give exactly **355**. Alternatives ruled out by re-running with the crowd refactor stashed (identical), checking input freshness, membership drift, and `numeric(5,2)` rounding (real, cosmetic, 0 failures).
- **Why nobody caught it:** `vercel.json` is `{}` — the analytics-sweep cron (`app/api/cron/analytics-sweep/route.ts`, which says so in its own header) has **never been registered**, so `badges.ts` is the de facto owner and `analytics_updated_at` records when the *other* writer last ran. **The timestamp lies.**
- **What's written (local, uncommitted):** `badges.ts` consumes the shared value and omits the columns entirely when it can't compute one, rather than guessing (`lib/push/badges.ts:213`); `everReachedLevel` added to `computeFullXPBreakdown` (`xpSystem.ts:570`); `lib/migrations/026_entry_xp_highest_level.sql`; `scripts/reseed-entry-xp.ts`; two new test files (`lib/push/__tests__/badges.xp-ownership.test.ts`, `lib/__tests__/xpSystem.level-ratchet.test.ts`). Suite **157/157 green**, no type errors in any touched file.
- **Decisions 2026-07-26:** **levels never demote** — the corrected formula moves 1,048 entries and **231 of them down**, so a ratchet mirrors the keep-once rule `badge_unlocks` already applies to badges; `total_xp` stays honest and may fall; and **the analytics-sweep cron is not to be registered** — scoring maintains the columns, and a second writer path is precisely what caused this.
- 🔒 **Blocked on a release, in a fixed order (R14):** apply 026 → deploy the `badges.ts` fix → run `scripts/reseed-entry-xp.ts` **immediately** → re-run the parity check. Deploying before the migration means PostgREST rejects the whole `entry_xp_state` upsert on the unknown `highest_level_reached` column — **as of 2026-07-26 that now fails loudly and skips the push** rather than silently, so the consequence is quiet badge/level pushes and a log line, not repeat notifications. Skipping the reseed still fires **~817 level-up pushes** in one burst.
- **Two defects in this fix were found after it was called done** — the missing `entryAnalytics` hoist (R15) and the unchecked upsert (R14) — both raised by this register, confirmed by Ryan against the code, and fixed 2026-07-26. Tests and typecheck re-run **after** those fixes: 157/157, clean.
- **Effort:** the code is done. What's left is ~1–2 hours of ops in one window, plus the parity re-run.
- **Done when:** parity comes back clean, `/pools` and `/dashboard` show a level with one definition behind it, and no user received a level-up push for a formula change.

> Beyond that and the **recurring knockout ops** below, the master fix list from the June outages is fully resolved (verified in code 2026-07-12). Its residual threads are tracked as their own items: *Badge batch*, *Mobile*, *Post-deadline lock*, *IO reduction*.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| WC incident master fix list `Bug` `Ops` | Opening-day outage fixes all landed: per-match recalc (`app/api/cron/sync-fixtures/route.ts:401` → `recalculatePool({matchId})`), sweep overlap + time-box guard (`try_acquire_sweep_lock` RPC, `sweep_time_box_enabled` flag), phantom-diff fix, badge fraction bug (commit `4e920b0`). | Tracking snapshot, not a work item — residual threads live under other items below. |

## 🔁 Recurring each knockout round — SF/Final upcoming

> Not "done"-able — re-run **before every knockout round** or scores don't sync / pools don't open.

### Knockout fixture API-linking `Ops`
- **Is:** Knockout matches must be manually linked to the live data feed each round, or scores never sync.
- **Touches:** `scripts/map-knockout-fixtures.ts` (writes `external_match_id` onto `matches`); the api-football sync cron reads it. Auto-link path also exists (`lib/integrations/apiFootball/linkKnockoutFixtures.ts`) but only fires once api-football publishes the fixture.
- **Effort:** ~15–30 min per round.
- **Done when:** every knockout match for the round has an `external_match_id` and live scores flow. Done: R32 (06-28), R16 (07-04), QF (07-07 + #100 07-12), **both SFs linked 2026-07-12 (#101 France–Spain `1585131`, #102 England–Argentina `1586077`)**. Remaining: #103 (3rd place) + #104 (final) once teams resolve.

### Progressive round-open playbook `Ops`
- **Is:** Each round opens per-pool; super-admin bulk-opens the rest and (optionally) emails members.
- **Touches:** `pool_round_states` UPDATE (guard `state='locked'`); announce via `scripts/notify-r16-open.mjs` (Resend "Pool Activity" topic).
- **Effort:** ~30–60 min per round.
- **Done when:** all pools for the round are open by deadline. Done: R16 (07-04, 194 pools/796 emails), QF (07-07, 250 pools). Recurs SF/Final.

---

## ⏭️ Next — WC stability & scale

> These four overlap — they're one coordinated "get off expensive compute and scale to thousands" program, not four separate efforts.

### Leaderboard precompute (read-path flip) `Infra`
- **Is:** The leaderboard recomputes per-entry analytics on *every* page load; that's what saturated the DB in the June 16 outage. Precompute it once per score-change instead of per-view.
- **Touches:** read path `app/api/pools/[pool_id]/leaderboard/route.ts` + `app/pools/[pool_id]/LeaderboardTab.tsx`; storage = extra columns on `entry_xp_state`; writer = `analytics-sweep` cron + `lib/analytics/entryAnalytics.ts`. Backfill/cron **already live and verified no-op** (M1/M2 done); remaining is the **M4 read-path flip** (read columns, drop `force-dynamic`, add cache) behind flag `analytics_read_from_columns`.
- ⚠️ **Audit 2026-07-12:** M4 confirmed **not started** — the leaderboard route still imports `computeStreaks`/`computeFullXPBreakdown` and recomputes per-read (zero `entry_xp_state` reads); flag `analytics_read_from_columns` appears only in prose, never in code. The cited design doc `drafts/M4_read_path_flip.md` is **missing from the repo** — recreate it or drop the reference.
- 🔒 **Blocked 2026-07-26 — the parity pass was run and it FAILED.** "Backfill-vs-live parity = 0 diffs" is the *Done when* on this item, and the first real run came back **187 of 331 entries mismatched**. The cause is not staleness and not the caching work: `entry_xp_state` has **two writers with different formulas** (**R13**). Until that has one owner, is deployed, and the re-seed has run, this flip cannot proceed. Result: `drafts/2026-07-26_analytics_parity_result.md`; checker: `npx tsx scripts/verify-analytics-parity.ts` (read-only, exits non-zero on failure, so it can gate the deploy).
- ⚠️ **The writer named in this item no longer applies.** This item says the writer is "the `analytics-sweep` cron + `lib/analytics/entryAnalytics.ts`". `vercel.json` is `{}` — **that cron has never been registered**, and Ryan's decision 2026-07-26 is **not to register it**: scoring maintains the columns via `lib/push/badges.ts` → `computePoolEntryAnalytics`. The flip's freshness guarantee therefore now rests on the scoring path, not on a sweep — which is a different design and needs re-validating on that basis.
- **Effort:** ~2–3 days (calm-window deploy + load test), **plus** the R13 release ahead of it. Bracket pools need a **separate** parallel-analytics track (~2–3 days more) — they score via `bonus_scores`, not `predictions`.
- **Done when:** backfill-vs-live parity = 0 diffs, the ~516ms leaderboard query drops to ~20ms, and a match-night load test holds on Medium compute.

### Scale downgrade XL→Medium `Infra` — ✅ DONE 2026-07-12
- **What happened:** Ryan downgraded XL→Medium himself as the tournament winds down. **Live-DB check 2026-07-12:** Phase-B was already 2/3 live — `pool_cache_enabled` **ON** and `scoring_diff_writes_enabled` **ON** in prod `sync_settings` (the earlier audit read the *code default* off, not the live value); only `sweep_time_box_enabled` remains off. Phase A hygiene applied 2026-06-30.
- **Still open (folds into other items):** flip the last flag `sweep_time_box_enabled` (crash fix), and **Phase D durable** — leaderboard precompute read-path flip + per-pool realtime broadcast, which is what keeps Medium comfortable at Showdown/EPL scale. See runbook `drafts/2026-07-12_xl_to_medium_downgrade_runbook.md`.
- **Watch:** CPU headroom / replication lag on the next live-ish window; the Phase-B flags are the rollback lever (bump compute back to XL if needed).

### Tournament IO reduction `Infra`
- **Is:** Punch list of background-IO cuts. **Largely done** — api-perf writer trimmed, policies consolidated, sync fan-out batched, per-match recalc + RLS initplan shipped; predictions auto-save is already a single round-trip (`predictions/route.ts:260`).
- **Touches:** Remaining open: drop 6 duplicate + 33 unused indexes (mechanical); realtime publication diet (remove tables that don't need live events — overlaps the broadcast migration).
- **Effort:** ~1 day for the index + realtime trims (pure DB migrations — no repo artifact to confirm).
- **Done when:** duplicate/unused indexes gone, realtime publication carries only tables that need it, no regression on a live day.

### Kickoff write spike `Infra`
- **Is:** At kickoff, a synchronous calc+write burst briefly spikes CPU (~4.3 on 2 cores) and replication lag. Recovered fine, but should be smoothed.
- **Touches:** the scoring sweep in `lib/scoring/recalculate.ts` + `app/api/cron/sync-fixtures/route.ts`; fix direction = precompute / batch / queue the burst.
- **Audit 2026-07-12:** `recalculate.ts` already batches (`batchSize = 50`, sequential `inBatches`, paginated reads) — the gap is a real queue/precompute, not zero mitigation. Folds into the precompute + scale work above.
- 🟠 **This path gained a new tenant on 2026-07-26 (R15) — and the O(n²) on it is fixed, but the tenancy isn't going away.** `detectAndPushBadgesForPool` — fired from `recalculate.ts:93` and `:322` on every recalc — now calls `computePoolEntryAnalytics` for the whole pool (`lib/push/badges.ts:156`), because that function is the single owner of `entry_xp_state`. Its per-entry crowd rebuild (~2.6M iterations on the largest pool) **is fixed** — hoisted at `lib/analytics/entryAnalytics.ts:201`. What remains by design is a **full-pool prediction pull per recalc** (~3.8 MB on the largest pool). It is fire-and-forget (`void`), so it doesn't block the recalc's return, but it burns the same function's CPU at the same moment. **`entryAnalytics.ts`'s header now says so** — *"ON THE SCORING PATH: treat added work here as scoring-path cost"* — which is the durable half of the fix, because the stale "DRAFT, not imported by any live code path" header is what made the regression easy to add.
- **Effort:** ~1 day incremental. *(The R15 hoist itself is done, in code, 2026-07-26.)*
- **Done when:** kickoff no longer produces a CPU/replication spike on the Supabase graph.

### Shadow scoring engine `Infra` 🔒
- **Is:** A set-based, DB-native replacement for the Node recalc, running in parallel as a validation tool (not customer-facing). Match + bonus + rank parity-verified for group + R32; fully automated via reconciler crons.
- **Touches:** `shadow_*` tables (all 5 confirmed present: `shadow_resolved_brackets`, `shadow_score_diffs`, `shadow_match_scores`, `shadow_bonus_scores`, `shadow_entry_totals`) + RPCs, `lib/scoring/shadowBrackets.ts`, `app/api/cron/shadow-materialize/route.ts`, and reconciler **pg_cron** jobs (`drafts/2026-07-0*_shadow_*.sql`). Migration plan is read-path-first, reversible, pilot = mobile + one web pool via `shadow_read_enabled_pools`.
- **Effort:** low urgency near-term — it's a parallel tool. The durable knockout resolver that was deferred here **landed early (2026-07-11)** as part of the tie-break bug fix (shared prediction-only resolver); `shadow_resolved_brackets` was rebuilt on it (0 backfill errors).
- ✅ **Knockout parity RE-VERIFIED clean 2026-07-12:** fresh shadow-vs-live compare showed 392 knockout mismatches that were **100% staleness** (shadow last materialized 2026-07-10 18:47, before the 2026-07-11 tie-break live recalc). A forced `shadow_apply_changes` re-materialize dropped them to **0** (69,852 knockout match-score rows agree; end-to-end totals 3,416/3,418, the 2 residuals being orphan unsubmitted-entry rows). Shadow's knockout **logic is correct**.
- ✅ **Ground-truth correctness audit 2026-07-13:** validated the shadow bracket against **actual results** (not just vs live, which only proves reproduction): 0 scoring violations across 36,678 full_tournament knockout rows (0 false awards, 0 false denials, 0 points-on-wrong-teams); resolver qualification = exactly the 32 teams that reached R32; actual standings match an independent points/GD/GF ranking on all 48 group positions. Shadow bracket is **ground-truth-correct through the QF**, not merely live-parity.
- ✅ **Cutover-hardening shipped 2026-07-13** (DB objects live; `recalculate.ts` + `shadow-materialize` route changes pending a deploy): **(#4)** `v_shadow_worker_runs` repointed off the retired `shadow-drain-queue` to the live jobs; **(#3)** automated parity alarm `shadow_detect_diffs()` + `shadow-parity-alarm` pg_cron (jobid 21, `*/15`) writes `entry_total_mismatch` rows + reports coverage-by-mode; **(#2)** `shadow_dirty_pools` marker closes the bulk-recalc staleness gap — `recalculatePool` full recomputes (no `matchId`) flag the pool, the shadow-materialize cron drains + re-scores it (re-scoring completed matches so fresh brackets take, change-only so it's cheap).
- ⚠️ **Out of shadow scope (#1):** `bracket_picker` pools (1,012 entries / ~20%) have **no shadow arm** — scored by the separate `lib/bracketPickerScoring.ts`. The parity alarm's coverage report surfaces this (`bracket_picker: live 1012 / shadow 0`) so it can't be silently assumed covered at cutover. A bracket_picker shadow arm is a separate project, deferred.
- 🔴 **The read-path cutover happened, and this document did not record it (added 2026-07-26).** The line below said the pilot was "deliberately deferred". In fact the full machinery shipped and was flipped: `f843788` (Phase A fidelity + read helper), `9e6db6e` + `e90db3c` (production-scoring kill switch), `96b996c` (rollback runbook) — all on `origin/master`. `lib/scoring/readSource.ts:48` gates reads per pool on `sync_settings.shadow_read_enabled_pools`; `lib/scoring/prodScoringFlag.ts:29` can disable the Node engine outright. `drafts/2026-07-19_caching_infrastructure_plan.md:20` records the state on 2026-07-19 as *"`shadow_read_enabled_pools = [all pools]` (shadow is the sole scorer as of the 2026-07-19 cutover)"*; the rollback path is `drafts/2026-07-19_prod_scoring_rollback.sql`. **Which engine is scoring right now is a live flag value and is unverified here.** Nobody should plan the EPL without answering that first.
- 🟠 **Shadow's podium logic is the pre-fix version.** Prod's podium was rebuilt to *derive* from completed matches (`lib/podium.ts`, `ea8d9da`); shadow's bonus SQL still `JOIN`s `tournament_awards` (`drafts/2026-07-02_shadow_calculate_bonuses_scoped_changeonly.sql:164`) — the exact root cause of the ~324k-point error remediated on 2026-07-21. **Shadow must not score a competition with a podium until this is fixed.** See *Podium bonus remediation* under ✅ Recently shipped, and **R4**.
- **Done when:** predicted brackets resolved once at entry submission (removing re-materialization); shadow's podium arm matches `lib/podium.ts`; and a read-path flip is validated **per pool** before any wider customer-facing flip (the 07-19 flip went to all pools at once and was rolled back at tournament end).

### EAS OTA pending `Mobile` — ✅ SHIPPED 2026-07-12
- **What shipped:** production OTA of the Jul 11 tie-break resolver (`bracketResolver.ts`, `tournament.ts`, `usePredictions.ts`) to runtime `1.0.0` (last prod build 2026-07-06, unchanged runtime — verified via `eas build:list`; branch had zero prior updates). Published **native-only** (see *Mobile web-export* bug below): iOS update group `283a68d0…`, Android `5307e504…`, branch `production`.
- **Done:** testers on the ≥ Jul 6 build pull the update; mobile bracket display now matches the shipped web tie-break correction.

## ⚡ Performance & caching

> Opened 2026-07-26. Scope came from Ryan: *"optimize the entire site so we do not have unneeded
> requests, unneeded calculations, or even when requesting data the app or web only requests exactly
> what is required — coupled with caching, web to mobile."* Three drafts:
> `drafts/2026-07-26_performance_optimization_audit.md` (what to stop doing),
> `drafts/2026-07-26_caching_strategy.md` (where to put what's left), and
> `drafts/2026-07-26_analytics_parity_result.md` (the blocker it found). Supersedes the caching-only
> scope of `drafts/2026-07-19_caching_infrastructure_plan.md`, which stays valid as the layer design.
>
> **Framing that ordered the work:** caching a wasteful query makes the waste cheaper, not smaller.
> Stop asking for data we don't use → stop asking repeatedly for unchanged data → stop recomputing
> what we already computed → *then* cache what's left.
>
> ⚠️ **Was:** *"Everything below is local and uncommitted."* **No longer true as of 2026-07-29** —
> steps 2, 3 and most of 7 are on `origin/master` (`db508ce`, `37ed969`, `4b3063a`), and the
> database-side changes (migrations 026/038, the analytics backfill, the C1 fix, the shadow read
> widening to all 623 pools, the leaderboard broadcast trigger) were applied directly to prod and
> did not need a deploy. Steps 1, 4, 5, 6 and the new 8 remain untouched.

### Measured baseline `Infra` — 2026-07-26
- **Where DB time goes** *(pg_stat_statements on `ujthamlehjyubbzxbnes`, cumulative since an unknown counter reset — **prod-sourced, unverifiable from this repo**)*: 337.5 total DB-hours. `SELECT predictions.*` **111.3h / 33.0% / 30.0M calls** · realtime WAL decoding 80.9h / 24.0% · `row_to_json(pool_members)` 34.5h / 10.2% at **404–450ms mean** (slowest by mean) · `match_scores` 31.0h / 9.2%. **Top four = 76.4%.**
- **Realtime WAL decoding at 24% is flagged and deliberately NOT addressed** — it is a publication-configuration question, not app code. It deserves its own pass; it is not in this one.
- **The distribution that drives every caching decision:** 623 pools, 4,809 memberships, **median pool = 1 member**, mean 7.7, 70% ≤5 members, **only 4 pools ≥100** (max 192); 288,029 predictions across 4,985 entries. High key cardinality, near-1:1 read-per-fetch for 90% of pools, extreme concentration in four. A cache only pays when one fetch serves many reads — so the strategy is **"cache the few genuinely shared things, precompute the rest"**, not "cache pool data".

### What landed locally `Infra` — verified in code 2026-07-26
- **`predictions.select('*')` → 8 named columns.** `lib/poolData.ts:247` now uses the shared `PREDICTION_COLUMNS` constant (`lib/poolData.ts:43`). `predictions` has 11 columns; `PredictionData` consumes 8, so `confidence_level` / `created_at` / `updated_at` were being `json_agg`'d and discarded on the single most expensive statement in the product. Measured effect on the largest pool: **5,420 kB → 3,854 kB (29%)** *(prod measurement)*.
- **13 of 14 whole-table `match_conduct` reads scoped**, via new `lib/matchConduct.ts` (filters through the `match_conduct → matches` FK in one round trip, and paginates so it cannot be truncated). Count verified by reading every call site: 7 web routes/pages + `lib/scoring/recalculate.ts` + `lib/scoring/shadowBrackets.ts` ×3 + 2 mobile hooks = 13 fixed; `app/api/admin/advance-teams/route.ts` deliberately not (**R16**).
- **Why that one mattered more than performance:** `match_conduct` has **no `tournament_id` column**, so an unfiltered read is inherently cross-competition *and* silently capped at 1,000 rows by PostgREST. 206 rows today; PL adds ~760 → 966; the competition after that truncates in silence. **Four of the 14 were inside scoring engines**, where truncation means wrong bonuses and wrong conduct tiebreaks with no error raised.
- **`computeCrowdPredictions` split** into `computeCrowdConsensus` (pool-wide, once) + `applyCrowdOverlay` (per entry) — `app/pools/[pool_id]/analytics/analyticsHelpers.ts:345`/`:435`, with `computeCrowdPredictions` kept as the composition so single-entry callers are untouched. It had been called once **per entry**, each call re-scanning every prediction in the pool: 192 × 13,385 ≈ **2.6M iterations** on the largest pool, in the leaderboard API route *and* client-side in `LeaderboardTab.tsx` and `CommunityTab.tsx`. Converted in **all four** — the fourth, `lib/analytics/entryAnalytics.ts`, was missed on the first pass and is the one that landed on the scoring path; hoisted 2026-07-26 (`:201` consensus, `:223` overlay) after this register flagged it. See **R15**. The two remaining `computeCrowdPredictions` callers (`AnalyticsTab.tsx:127`, `entries/[entry_id]/analytics/route.ts:224`) are genuinely single-entry — verified, not an oversight.
- **The badge snapshot upsert now fails loudly** (`lib/push/badges.ts`, 2026-07-26). It was unchecked; it now captures the error, logs it, and **returns before pushing** — because that snapshot is the diff basis for "what's new", so a silent write failure would make the next run re-derive the same badges and levels as new and push them again. **Silence is the safe failure**, and it is the same class of bug as the swallowed `pool_members` error that made this pipeline a no-op for months. Reduces **R14** from a code defect to a release-ordering constraint.
- **Also in the same change:** `teams` was unscoped in `bracket-picks/calculate`, `dashboard/page.tsx` and `profile/page.tsx` — now filtered by tournament.
- **Verification:** vitest **157/157 pass**, `tsc --noEmit` shows **no error in any touched file** (the only errors are the known local phantoms — `mobile/` resolved through the root tsconfig, the `FormData` false positive, and an iCloud `routes.d 2.ts` duplicate). Both re-run **after** the R14/R15 fixes on 2026-07-26, not just before them.
- **Two of this section's own defects were found by the register and fixed the same day** — the R15 hoist and the R14 error check. Recorded because it is the argument for auditing a performance change against the code rather than against its own summary: both were in the change that was described as complete and tested.

### Open work, in the sequence Ryan set `Infra`
| # | Step | State |
|---|---|---|
| 1 | **Mobile client cache (react-query)** | Not started. Mobile has **no** client cache at all — hand-rolled `useState`/`useEffect`, six surfaces refetching on `useFocusEffect`, so every tab switch re-runs a full load including the uncached leaderboard route. Largest untapped mobile win; needs no server change |
| 2 | **Fix the 30s full-page poll** | ✅ **Shipped 2026-07-29** (`db508ce`). The poll no longer refreshes the page — it calls the `/live` delta, and the interval is now adaptive: 30s while a match is live, 5 min otherwise. ~198 MB/hour of "nothing changed" removed for 50 concurrent viewers |
| 3 | **Shrink the pool payload below 2 MB** | ✅ **Shipped 2026-07-29** (`db508ce`). **7,721 kB → 457 kB** measured on the 192-entry pool, now well inside the 2 MB cache limit. Note the 3,854 kB figure quoted here was the ON-DISK size; the wire size was 12,683 kB before the column narrowing. Both pool-wide arrays left pool open: the leaderboard reads precomputed rows, the remaining consumers fetch per tab behind `/api/pools/:id/bulk` |
| 4 | **Tagged SWR cache on the mobile API routes** | Not started. 30s staleness budget (decided). Replaces today's `expire: 0` invalidate-on-every-score, which hard-expires every affected pool at exactly the moment traffic peaks |
| 5 | **`s-maxage` + SWR on `/play/*`, `/tv/*`** | Not started. The only CDN change recommended |
| 6 | **React `cache()` request-scoped dedup** | Not started. Free; removes repeat `isPoolCacheEnabled()` / `requireAuth()` / `getScoringSource()` lookups. Mobile separately re-resolves `auth_user_id → user_id` in **11 files** for a value that is constant for the session |
| 7 | **Flip analytics reads to `entry_xp_state`** | 🟡 **Unblocked and half done, 2026-07-29.** R13 cleared: migration 026 applied, all 623 pools backfilled (697 levels up, 0 down), parity **clean** 331/331. The **leaderboard** now reads the stored row. Form and Banter still compute live — they show the XP *breakdown* and derive badge objects — but both now pass the ratchet floor so every surface agrees on a member's level (`4b3063a`). Remaining: their badge lists would need a parity check before reading `earned_badge_ids` |
| 8 | **Mobile: live leaderboard via the broadcast** | ✅ **Shipped to the repo 2026-07-29 — needs an OTA to reach devices.** ⚠️ **The premise recorded here yesterday was WRONG and is corrected:** mobile was *not* paying the per-row CDC fan-out. Every mobile `pool_entries` subscription is filtered to the user's **own** `member_id` (`usePoolEntries.ts:124`) — one or two rows, not 192. The real finding is worse and more useful: **mobile's leaderboard was never live at all.** Its only realtime channel on that screen watches `pool_members` (joins/leaves), so during a match the standings sat still until the user navigated away and back (`app/pool/[id].tsx:153` refreshes on focus). `usePoolDetail.ts` now subscribes to `pool:{id}:leaderboard`, applies points/ranks from the payload and re-sorts, with a jittered refresh behind it for the stats half. **`pool_entries` still belongs in the `supabase_realtime` publication** — those filtered subscriptions are legitimate and unrelated |
| 9 | **Banter: read stored badges** | 🔴 **BLOCKED — parity checked 2026-07-29, `drafts/2026-07-29_banter_badge_parity_result.md`.** 266 of 341 members differ, and every difference has a named cause. (a) `badges.ts` is a *slim* implementation that SKIPS `dark_horse` — flipping today would strip 🐴 from 78% of members; now cheap to fix because migration 039 provides the crowd split it lacked. (b) `legend` stored for 9 who no longer derive it — stored is CORRECT, levels ratchet. (c) `top_dog` stored for 4 who are no longer #1 — needs a product ruling: does Top Dog mean you ARE #1 or you REACHED #1? `xpSystem`'s displayedBadges says the first, the keep-once principle says the second. Banter is the last consumer pulling the pool-wide arrays for an aggregate reason |
| 10 | **Form tab: precompute the analytics, display only** | 🔵 **DIRECTION SET BY RYAN 2026-07-29 — deliberately NOT done for the World Cup.** WC is finished, and league analytics will be a different shape, so building it against WC semantics would be building it twice. **The design is settled**: do to Form what was done to the leaderboard — the BACKEND computes every analytic once when a score changes and writes it down; the front end (web AND mobile) just reads rows and renders them, computing nothing. Half the inputs already exist: `entry_xp_state` stores hit rate, exact count, streak, last-five, level and total XP, and migration 039 stores the per-match crowd split (both live, both already read). What is still computed at request time: the XP BREAKDOWN line items (which match earned what), accuracy-by-stage, and the badge set (see step 9's `dark_horse` gap). Those are the pieces a league version needs to define first — the storage pattern is proven, only the analytics themselves change |
| 11 | **Nightly self-healing re-score (01:00 UTC)** | 🔵 **DEFERRED BY RYAN 2026-07-29 — record it, do not build it yet.** No competition is running, so there is nothing to heal; add it before the EPL season starts. **What it is:** `SELECT shadow_finalize_totals(null)` on a cron at **01:00 UTC**, re-scoring and re-ranking every pool. **Why it is worth having:** measured 2026-07-29 at **9.5 seconds for all 623 pools** (287,789 predictions, 287,066 score rows) — cheap enough to run blind — and that single test run **corrected 12 genuinely stale rows** in *Mastek Asylum project* whose ranks no reconciler had revisited. The reconcilers (jobid 19/20) are event-driven: a pool whose inputs shifted in a way the detector does not watch keeps stale ranks indefinitely. ⚠️ **The parity alarm cannot catch this** — `shadow_detect_diffs` compares TOTALS only and was green throughout. Write-safe by construction: `shadow_finalize_totals` is diff-aware, so a correct pool is not rewritten and fires no broadcast (that run rewrote 12 of 4,272 rows and sent 1 message). ⚠️ Pick the hour against the fixture list when leagues start — 01:00 UTC is quiet for the World Cup, not necessarily for the EPL |

- **Effort:** each step is order-of-magnitude ~0.5–2 days; steps 1–3 hold most of the value and need no new infrastructure. **Not a commitment.**
- **Done when:** the top-four statement share falls materially against a fresh `pg_stat_statements` baseline, mobile stops refetching on every focus, and the pool payload fits a shared cache.

### Decisions settled 2026-07-26 (infrastructure) `Infra`
> Recorded here rather than under *Project: Multi-sport platform* — those eight are **product**
> decisions and are not renumbered by these.
1. **Staleness budget for cached reads: 30 seconds.** Matches the existing poll cadence and the recorded "predictions app, not a score tracker" principle. Drives the step-4 TTL.
2. **Mobile client cache: react-query.** Takes the dependency; buys focus-dedup, TTL, background refetch and request de-duplication — all four of which the hand-rolled hooks need.
3. **CDN is never for pool detail.** Keeps exactly three jobs: static assets, images, and the genuinely public `/play/*` and `/tv/*` boards. The numbers back the call: median pool = 1 member ⇒ ~0% edge hit rate; many isolated PoPs multiply cold misses on 623 low-traffic keys; and the content is auth-gated and viewer-shaped (own picks, admin visibility, the reveal gate), so a shared object either leaks picks or fragments the key per user and takes hit rate to zero.
4. **Redis: hold.** Not justified by current numbers, and steps 1–4 change the shape of the problem. When it is revisited, the case is specific: a leaderboard **is** a sorted set (`ZADD`/`ZREVRANGE`/`ZRANK` give top-N and a member's rank in O(log n)) — adopt it as the leaderboard *data structure*, not as a generic blob cache.
5. **Levels never demote** and **the analytics-sweep cron is not to be registered** — both recorded on the *XP has two writers* item above, since that is where they bite.

---

## ⏭️ Next — scoring correctness & data integrity

### Badge batch — persistence + semantics `Scoring` ⏳
- **Is:** The blatant fraction bug (Dark Horse/Upset Caller firing for everyone) is **already fixed** (commit `4e920b0`, verified live in `xpSystem.ts:256`/`:416`). What's left: (a) badges vanish on recompute because there's no persistence, and (b) a few badges whose copy ≠ logic.
- **Touches:** persistence = new append-only `badge_unlocks` table (see *Badge unlock history*); semantic fixes in `app/pools/[pool_id]/analytics/xpSystem.ts` — Contrarian Win (copy says "75%+", logic checks "differs from majority"), Lightning Rod (no deadline check), Quick Draw (24h measured from pool creation, not join); award-on-completion-only gating in `recalculate.ts` + `lib/push/badges.ts`; mirror every change into `lib/push/badges.ts` (push parity).
- ⚠️ **Audit 2026-07-12:** confirmed — `badge_unlocks` table **does not exist** (persistence not started; the only store is the *mutable* `entry_xp_state.earned_badge_ids` array, which shrinks on recompute); all 3 semantic mismatches still present; no completion gating (`detectAndPushBadgesForPool` fires after every write).
- **Effort:** persistence ~1–2 days; semantic copy/logic fixes ~0.5 day; completion-gating ~0.5 day.
- **Done when:** an earned badge never disappears across recalcs; each badge's copy matches its trigger; push and analytics never disagree.

### Post-deadline prediction lock `Bug` — ✅ SHIPPED 2026-07-12
- **What shipped:** DB trigger `trg_enforce_prediction_before_kickoff` on `public.predictions` (fn `enforce_prediction_before_kickoff`) — a `BEFORE INSERT OR UPDATE` row trigger that **silently skips** (returns null) any write to a match that has kicked off (`match_date <= now()`) or is completed. Migration `prediction_kickoff_lock`; SQL in `drafts/2026-07-12_prediction_kickoff_lock.sql`.
- **Why a DB trigger, not the route/RPC guard originally scoped:** predictions have four write paths with no shared app chokepoint — web `POST /predictions` → `save_predictions_batch` (SECURITY INVOKER), the web client's **full-set autosave** (`PredictionsFlow.tsx:377`), and **mobile's direct `.upsert()` in `usePredictions.ts` which bypasses every API route**. Only the row write is common to all. Silent-skip (not raise) is deliberate so a full-set batch still persists the still-open matches instead of failing wholesale.
- **Verified in prod:** a write to an upcoming match persists; a write to a completed match is skipped. Pre-fix footprint: 2,599 post-kickoff writes across 478 entries (latest 2026-07-11).

### Empty-bracket bonus inflation `Bug` `Scoring` ⏳
- **Is:** entries that predicted almost nothing collect most of the group bonuses. With no predictions a group's teams are all `played 0 / points 0 / GD 0`, so `calculateGroupStandings` falls through every tiebreaker to criterion 8, **FIFA ranking** (`lib/tournament.ts:398-414`) — and the resulting "predicted" table is just the seeded order, which is roughly what really happens. `calculateGroupStandingsBonuses` (`lib/bonusCalculation.ts:120`) gates only on the real matches being *complete*, never on the member having *predicted* them.
- **Same class as the podium's fabricated pick**, fixed in `ea8d9da` via `requireExplicitPick` (`lib/tournament.ts:641`); the group-standings path never got the equivalent gate. Criterion 8 is right as a cascade fallback, wrong as evidence of an opinion.
- **Measured (prod 2026-07-21):** 155 entries with 1–5 predictions all tournament — 66 full_tournament (avg **1,881** bonus vs **56** match pts) + 89 progressive (1,340 vs 233). A near-zero predictor earns **~77% of a full predictor's bonus** with ~2% of their match points. Tells: **994 `group_winner_and_runnerup` rows across 139 entries ≈ 7.2 of 12 groups called exactly right**, and `75pct_qualified_correct` fired for **140 of 140**. ≈ **243,000 pts** inflated.
- **Fix:** require the group's 6 matches (and, for the qualification bonus, all 48) to have been predicted before awarding; better, make an unpredicted group return an explicitly *unresolved* table so the phantom standings can't leak to any consumer. Regression test: zero group predictions ⇒ zero group/qualification bonuses.
- **Why deferred:** fixing it retroactively demotes ~155 real people (~87 pools move). Do it **before the next competition**, not during this one's wind-down.
- **Detail:** `drafts/2026-07-21_empty_bracket_bonus_inflation.md` · **Status:** deferred by decision 2026-07-21.

### Recalc orphan-row cleanup `Bug`
- **Is:** When an entry is un-submitted after being scored, its `match_scores` rows are left behind (11 seen in June).
- **Touches:** delete-scope logic in `lib/scoring/recalculate.ts` (currently only touches current entryTotals).
- ⚠️ **Audit 2026-07-12:** confirmed — deletes are scoped to `allEntryIds` derived from *submitted* entries only (`recalculate.ts:482`); an un-submitted entry drops out of that set, so its old `match_scores` are never touched. A one-off sweep is also needed to clear existing orphans.
- **Effort:** ~0.5 day.
- **Done when:** zero orphan `match_scores` rows for unsubmitted entries after any sweep.

### Perfect-group bonus `Scoring`
- **Is:** New optional scoring rule — bonus for nailing all 4 positions in a group. (Carson's feedback, May 2026.)
- **Touches:** scoring config (`ScoringRulesTab.tsx` + settings), bonus calc (`lib/bonusCalculation.ts` / `lib/scoring`), and the shadow engine mirror.
- **Audit 2026-07-12:** TODO — no perfect-group setting or award logic exists (`calculateGroupStandingsBonuses` only rewards winner/runner-up).
- **Effort:** ~1 day.
- **Done when:** admins can toggle it, it awards correctly on group completion, and shadow parity holds.

### Penalty-prediction redesign `Scoring`
- **Is:** Rework the "goes to penalties" knockout bonus so it can't be gamed by blanket check/uncheck. (George's feedback, May 2026.)
- **Touches:** ⚠️ **corrected 2026-07-12** — the gameable logic lives in `lib/bracketPickerScoring.ts:306` (+ emitted via `lib/scoring/bracket.ts`), **not** `lib/bonusCalculation.ts` as previously noted. It's a bracket_picker-mode rule; the full_tournament/progressive PSO path (`points.ts` `calculatePsoPoints`) predicts the actual shootout score and isn't gameable the same way. Interim workaround remains admins setting `bp_penalty_correct=0`.
- **Audit 2026-07-12:** TODO — logic still awards points whenever `predictedPenalty === actualWentToPenalties` (blanket strategy scores).
- **Effort:** ~1–2 days (needs a scoring-design decision first).
- **Done when:** the bonus rewards genuine skill, not a blanket strategy; verified against sample entries.

---

## 🚀 Post-WC near-term — Showdown / EPL launch (target Aug 2026)

### Showdown mode `Feature`
- **Is:** The flagship post-WC product — a head-to-head pick'em league. Every gameweek you're randomly paired with another pool member; beat their accuracy to take the points (3 win / 1 draw / 0 loss, 38-week season). Creates a personal league with named rivals and a "Banter Cup" side-pot. Full spec captured in notes.
- **Touches:** new pairing engine + duel-scoring model + `pool_templates`-style mode; reuses office mini-league, WhatsApp share, QR join, and OG-preview infra. Sub-tracks: **prep** (pairing engine, duel scoring, Banter Cup logic, schema on paper) · **animations** (Remotion server MP4 for the tunnel walk-out reveal, `next/og` previews, Reanimated + Skia in-app, Lottie hand-off) · **notifications** (below).
- **Audit 2026-07-12:** TODO — zero engine code (no pairing/duel/Banter-Cup/`pool_templates`); spec-only.
- **Effort:** multi-week epic — core ~1–2 wks, prep ~1 wk, animations ~1 wk.
- **Done when:** a 10-person pool can run a full season of weekly duels with correct scoring, standings, tiebreakers, and the Monday pairing reveal.

### Showdown notifications `Feature`
- **Is:** The engagement loop for Showdown — pairing-reveal push, duel-result push, Banter Cup standing-change push, plus deep links into the matchup card → reveal animation. Closes the virality loop (push → tap → reveal → screenshot → share).
- **Touches:** `expo-notifications` + existing `/api/notifications/*` endpoints + Resend; 4 new email templates; deep-link routing in the Expo app.
- **Audit 2026-07-12:** TODO — depends on Showdown mode; generic notification infra exists but nothing Showdown-specific is wired.
- **Effort:** ~4 days (launch-critical for Showdown).
- **Done when:** a completed gameweek fires the right pushes/emails and each deep-links to the animated matchup card.

### Avatars v1 `Feature`
- **Is:** Real profile avatars with an initials fallback. Gates Showdown matchup-card personalization.
- **Touches:** Supabase Storage bucket + `<Avatar>` component + upload UI (Expo + web) + profile screen.
- **Audit 2026-07-12:** TODO — only **initials-fallback placeholders** exist; no `avatars` bucket, no `avatar_url` column, no image upload (grep for `expo-image-picker`/`uploadAvatar` = 0).
- **Effort:** ~3–5 days.
- **Done when:** a user can upload an avatar that renders across web + mobile, with initials fallback when none is set.

### Match-day recap emails `Feature`
- **Is:** Replace the weekly recap with a per-match-day recap.
- **Touches:** `lib/push/recaps.ts` + `lib/email/resend.ts` + `AutomatedEmailsTab.tsx`; re-enable the email crons when a competition is live.
- ⚠️ **Audit 2026-07-12:** the matchday recap is **already built — but as an APNs push, not email** (`firePendingMatchdayRecaps` in `recaps.ts`, `app/api/cron/push-matchday-recap`, dedup table `push_matchday_recaps_sent`). No recap **email** template exists, and the **weekly** recap it was meant to replace is **still present** (`firePendingWeeklyRecaps` + `push-weekly-recap`). Remaining: decide push-vs-email, build the email template if wanted, retire weekly, confirm the cron is scheduled/enabled.
- **Effort:** ~1–2 days.
- **Done when:** a match day triggers one accurate recap (email if that's the decision); crons re-enabled and verified.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Post-tournament feedback plan `Feature` | Both survey emails built — `poolAdminFeedbackSurveyTemplate` + `playerFeedbackSurveyTemplate` (`lib/email/templates.ts`), send route `app/api/admin/send-template/route.ts` (segments `pool_admins` + `past_predictors_non_admin`), super-admin UI `TemplatesTab.tsx`. | ⚠️ **"Built" was not "sendable" — see 2026-07-21 below.** Now ready; the two sends are the only remaining (ops) step. |

## 📋 Features — medium priority

### Badge unlock history `Feature`
- **Is:** Append-only record of badge unlocks so we can show "10× Lightning Rod" and per-badge timelines. (Also the persistence half of the Badge batch.)
- **Touches:** new `badge_unlocks` table + write on badge detection + read in the badge UI.
- ✅ **SHIPPED 2026-07-12 (capture half):** append-only `badge_unlocks` table (migration `badge_unlocks_history`; SQL `drafts/2026-07-12_badge_unlocks_history.sql`) + write in `lib/push/badges.ts` (idempotent upsert on every recalc) + one-time backfill of **15,934** existing unlocks. RLS: pool members can read their pools' unlocks.
- ✅ **Read half — web SHIPPED 2026-07-12:** `computeFullXPBreakdown` now takes `everEarnedBadgeIds` and unions them into the displayed badge set (display-only — XP/level stay on the live set; transient `top_dog` excluded). Wired in the web AnalyticsTab (lazy `badge_unlocks` fetch) + the entry-analytics route (so any mobile client consuming `/analytics` benefits server-side, no OTA).
- ✅ **Mobile also covered — no OTA (verified 2026-07-12):** the mobile FormTab, banter badge-flex, and activity feed all read badges from the **same `/analytics` route** (`FormTab` → `useEntryAnalytics` → `fetchEntryAnalytics` → `data.xp.earned_badges`); grep confirms **no mobile file reads `entry_xp_state.earned_badge_ids` directly**. So the server-side union reaches mobile as soon as the deploy is live.
- ✅ **Bracket-picker (`bp_*`) SHIPPED 2026-07-12:** `computeFullBPXPBreakdown` gained the same `everEarnedBadgeIds` display-only union; the `/bracket-analytics` route now **writes** earned `bp_*` badges to `badge_unlocks` (idempotent — both the pre-tournament submission-badge path and the full path) and passes ever-earned for the display union; web `AnalyticsTab` fetches + passes them. **Capture is server-side** (on any `/bracket-analytics` compute — mobile always hits it); the one edge is a web-only BP entry never computed server-side (no scoring-time BP badge path exists to hook, unlike full/progressive's `badges.ts`). **No BP backfill** — BP badges were never persisted anywhere to backfill from, so they populate lazily on next analytics view.
- **Done when:** unlocks recorded permanently + cumulative counts render — persistence, backfill, and the full/progressive **and** bracket-picker display all done. Remaining polish only: the profile trophy-case / cumulative-count *UI*, and the semantic/XP items under *Badge batch*.

### Super-admin project dashboard `Feature`
- **Is:** A lightweight visual of this roadmap inside super admin.
- **Touches:** a super-admin page reading `SPORTPOOL_PROGRAMME.md` (v1) — later possibly a `roadmap_items` table.
- **Audit 2026-07-12:** TODO — no roadmap tab in `SuperAdminDashboard.tsx`; no `roadmap_items` table.
- **Effort:** ~1–2 days (v1 read-only).
- **Done when:** the roadmap renders in super admin without hand-editing HTML.

### Creative pool-name award `Feature`
- **Is:** Admin-curated "hall of names" honouring great pool names. Lowest priority.
- **Touches:** a badge on the pool card (v1 = no voting/algorithm).
- **Audit 2026-07-12:** TODO — no code found.
- **Effort:** ~1 day.
- **Done when:** an admin can flag a pool name and a badge shows on its card.

### Enhanced super-admin stats `Feature`
- **Is:** New super-admin metrics — number of pool admins, average pool size, and how many users have deleted their account. `#SuperAdmin`
- **Touches:** the super-admin dashboard/stats page + aggregate queries over pools / members / deleted accounts.
- ✅ **SHIPPED 2026-07-12:** added to `app/api/admin/stats/route.ts` + surfaced in `StatsTab.tsx` — pool-admin count (`role='admin'` memberships: 606), average pool size (`totalPoolMembers / totalPools`), deleted-account count (`users.is_active = false`). Shown as overview-card subtitles (Users → "N deleted", Pools → "avg N", Predictions → "N admins").
- **Done when:** super admin shows admin count, average pool size, and deleted-account count, accurately — done.

### Lifetime trophy tracker `Feature`
- **Is:** Split the profile page's statistics section into its own navigable page with an achievements area — including cumulative counts of how many of each trophy/badge a user has earned. `#Achievements`
- **Touches:** profile page (web + mobile) → a dedicated stats/achievements sub-page; reads cumulative badge counts — depends on *Badge unlock history*'s append-only table for accurate lifetime totals.
- ✅ **Web v1 SHIPPED 2026-07-12:** the `badge_unlocks` gate is now satisfied (table built + backfilled). Added a **Trophy Case** section to the profile Statistics tab (`ProfilePage.tsx` `AchievementsSection`) — reads the user's `badge_unlocks` directly (RLS-safe), renders a tier-styled grid of every badge earned with cumulative "N×" counts (full/progressive + bracket-picker; Top Dog excluded as transient). Data path verified against real users (richest = Oracle 5× / Lightning Rod 5× / Stadium Regular 5×).
- ✅ **Per-badge timeline added 2026-07-12:** tapping a badge opens a modal listing which pools you earned it in (grouped by pool, with per-pool counts) + the date, via the `badge_unlocks → pools` FK. Data path verified (e.g. Oracle → Alabamaron22 ×3, Rochester ×2).
- **Known limitation:** timeline dates are the **backfill date** for pre-existing badges — accurate going forward; the *pool breakdown* is what's meaningful now.
- ✅ **All three follow-ups SHIPPED 2026-07-13:** (1) **left-pool fix** — additive `badge_unlocks` self-read RLS policy (`user_id` → `auth.uid()` via `users.auth_user_id`; migration `badge_unlocks_self_read`, draft `drafts/2026-07-13_badge_unlocks_self_read.sql`), so a user sees their own unlocks even in pools they've left; (2) **dedicated page** — the Trophy Case is now its own profile tab (`?tab=achievements`), moved out of Statistics with a full header; (3) **mobile** — a Trophy Case section on the mobile profile (`profile.tsx` `TrophyCaseSection`) reusing the `badgeIcon` medallions + cumulative counts (ships via OTA).
- **Remaining:** only the live-auth visual confirmation (can't render locally — types + data paths verified) and the mobile OTA push.

### Home-screen widgets `Feature` `Mobile`
- **Is:** Widgets so users see key info without opening the app — current pool rank, upcoming-match countdown, predictions still to make, recent leaderboard movement.
- **Touches:** iOS/Android home-screen widget extensions (WidgetKit / Expo) + a lightweight read API for the surfaced stats.
- **Audit 2026-07-12:** TODO — no widget/extension/app-group config anywhere.
- **Effort:** ~3–5 days.
- **Done when:** a user can add a widget showing at least rank + next-match countdown + outstanding predictions, refreshing sensibly.

### In-progress pool landing page `Feature`
- **Is:** A landing screen tailored to pools already underway (mid-tournament), surfacing what matters during play — current standings, recent results/movement.
- **Touches:** pool detail (web + mobile) — a mid-tournament layout variant keyed off pool/tournament state.
- **Audit 2026-07-12:** PARTIAL — the app already **defaults to the live leaderboard** on both platforms and rank-delta arrows exist (`LeaderboardTab.tsx:1106`, mobile `LeaderboardPodium.tsx:93`), but there's **no tournament-state-keyed layout variant** — the same static default serves pre/in-progress/completed pools alike.
- **Effort:** ~2–3 days.
- **Done when:** an active pool opens to an in-progress view that leads with live standings + recent movement.

### 2nd Chance Cup — full-tournament redemption `Feature` `Scoring`
- **Is:** A redemption side-game for `full_tournament` players whose locked bracket is busted. When the knockout stage starts, eligible players redraw predictions for the remaining matches and compete on a separate leaderboard — keeping busted players engaged.
- **Touches:** `full_tournament` mode — a second prediction set + separate leaderboard/scoring track + eligibility + an entry window at knockout start; scoring engine + shadow mirror.
- **Audit 2026-07-12:** TODO — no code found.
- **Effort:** ~1–2 weeks (new scoring track).
- **Done when:** after the knockout stage opens, eligible players can submit a fresh remaining-matches bracket that scores on its own leaderboard without affecting the main one.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Admin member-management actions `Feature` | `app/pools/[pool_id]/admin/MembersTab.tsx` — view / adjust-points / unlock / promote / demote / remove / delete-entry; `point_adjustments` audit trail; mode-aware branches; mobile member-detail (`mobile/app/pool/[id]/member/[memberId].tsx`). | Full parity across all three modes. |
| Pool Info tab + non-admin leave `Feature` | Read-only Pool Info tab both platforms (web `PoolInfoTab.tsx`, mobile `PoolInfoTab.tsx`); leave via `/api/pools/[pool_id]/leave` (audit row + sole-admin guard); mobile stop-participating fix. | The PoolInfoTab 400-fix + leave are **in the pending EAS OTA** — live on web, not yet on testers' phones. |
| Activity tab — XP gains `Feature` | Mobile Activity tab real — `mobile/lib/useActivity.ts` synthesizes `xp_gain` items (match/bonus/badge XP), rendered in `ActivityCard.tsx`. | Mobile only; the web activity route stubs `xp_gain` ("NOT computed here yet") — web parity optional. |

## ⚽ Live match & rich football data

> A cluster from the board's "Others" column — richer team/player/match data plus live-match state. Mostly new api-football pulls + new detail screens; grouped so they can be built as one content system. **Audit theme (2026-07-12):** the api-football client only fetches fixtures/events/teams; the five "rich data" items below are all TODO and DB-gated. The live-state items are further along on **mobile** than web.

### Detailed team page `Feature`
- **Is:** Tap a team anywhere (fixtures, standings, predictions) to open a team detail page with its own tabs — squad list, honours/trophy history, etc. Parent for several items below.
- **Touches:** new team-detail route (web + mobile) + team data from the sports API (api-football).
- **Audit 2026-07-12:** TODO — no team-detail route; teams render as non-tappable flags+names.
- **Effort:** ~3–5 days.
- **Done when:** tapping a team opens a detail page with at least a squad tab and an honours/history tab.

### Full team squad `Feature`
- **Is:** A tab on the detailed team page showing the full team squad.
- **Touches:** the team-detail page (above) + squad endpoint from api-football.
- **Audit 2026-07-12:** TODO — no squad UI; api-football client has no squad/players endpoint.
- **Effort:** ~1 day (once *Detailed team page* exists).
- **Done when:** the team-detail page lists the full current squad.

### Player detail page `Feature`
- **Is:** Tap a player (from a squad, starting lineup, etc.) to see that player's history and detail.
- **Touches:** new player-detail route (web + mobile) + player data from api-football.
- **Audit 2026-07-12:** TODO — no player route or endpoint.
- **Effort:** ~3–5 days.
- **Done when:** tapping a player opens a page with their key history/details.

### Match line-ups `Feature`
- **Is:** A tab showing each team's line-up on a pitch appropriate to the sport (football pitch; formations like 4-4-2 / 4-2-3-1).
- **Touches:** match detail page + lineup endpoint from api-football + a pitch/formation renderer.
- **Audit 2026-07-12:** TODO — no lineup/formation code or endpoint.
- **Effort:** ~2–4 days.
- **Done when:** the match-detail page shows both line-ups on a pitch with formations, when the API provides them.

### Match events `Feature`
- **Is:** A tab (or section on the match-detail page) for in-match events — goals, red/yellow cards, subs — whatever the API exposes.
- **Touches:** match detail page + events endpoint from api-football.
- **Audit 2026-07-12:** TODO — `getFixtureEvents` IS fetched by the sync cron, but only **Card** events are kept (→ `match_conduct` for scoring); goals/subs are discarded, and there's no `match_events` table or events UI.
- **Effort:** ~1–2 days.
- **Done when:** the match-detail page lists match events (cards, goals, subs) for a live/completed match.

### Live match minutes (min / HT / FT) `Feature`
- **Is:** Show live match state — current minute elapsed, an HT indicator at halftime, FT at full-time.
- **Touches:** match cards/detail + live minute/status from api-football (`matches.live_minute`/`live_period` already populated).
- ✅ **Web SHIPPED 2026-07-12:** new shared `lib/matchStatus.ts` `getLiveClock` wired into the Results `MatchCard` — renders `45'`/HT/ET/PENS with the pulsing LIVE dot. Data already flowed (poolData `select('*')`); added the fields to `MatchData`/`ResultMatch` + mapping.
- ✅ **Bracket surface added 2026-07-12:** live clock + status wired into `BracketResultsTab` (knockout cells + Final/3rd-place cards), reusing `lib/matchStatus.ts`. StandingsTab intentionally skipped — it's group-stage standings and the group stage is complete (no live group matches). Remaining polish: explicit "FT" (currently implicit via the final-score box).
- **Done when:** live matches show the running minute, HT at halftime, and FT at full-time on **web** too — met for the Results tab.

### Match status notes (delayed / postponed / cancelled) `Feature`
- **Is:** Surface exception statuses — delayed, postponed, cancelled, abandoned, rescheduled — instead of assuming every match kicks off on time.
- **Touches:** match cards/detail + status detection (`matches.status_detail` + `original_match_date`; badging added in `00c4ae2`).
- ✅ **Web SHIPPED 2026-07-12:** `getMatchStatusBadge` (in the new shared `lib/matchStatus.ts`) wired into the Results `MatchCard` — Delayed/Postponed/Suspended/Cancelled/… render as amber/red pills. Mobile already had it.
- ✅ **Bracket surface added 2026-07-12** (`BracketResultsTab` cells + Final cards). StandingsTab skipped (group stage complete).
- **Done when:** a non-normal match clearly shows its exception status to users on **web** too — met for the Results tab.

### Key-match indicator (per player, in-pool) `Feature`
- **Is:** Flag a player's "key" matches in a pool — e.g. a very tightly predicted match, or one where the user's pick differs from the majority — to draw attention to high-leverage games.
- **Touches:** predictions/leaderboard views + a per-user/per-match calc comparing the user's pick vs the pool distribution.
- **Audit 2026-07-12:** TODO — only retrospective contrarian awards exist; nothing flags an upcoming/in-play match as key.
- **Effort:** ~1–2 days.
- **Done when:** a user sees their high-leverage matches flagged (contrarian pick and/or tight margin) in the pool.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Live match indicator `Feature` | Web animated cues — `MatchCard.tsx` `animate-ping` "LIVE" dot, `StandingsTab`/`BracketResultsTab` `animate-pulse`; mobile LIVE cue on `LiveMatchCard`/`MatchResultRow`/detail header, all keyed off `status='live'`. | Mobile dot is static (not animated) — minor polish vs web. |
| Penalty-shootout scores on results `Feature` | Web `MatchCard.tsx:222` renders `PSO: h-a`; mobile `MatchResultRow.tsx:220` + match-detail header render `(h-a PSO)`; `home/away_score_pso` selected in read hooks. | ✅ **Already shipped** — supersedes the earlier "candidate to build" note. |

## 💬 Social & messaging

> Board "Others" cluster — connect players beyond a single pool's chat. Reuses the realtime Broadcast-from-DB infra from the July 2026 banter migration.

### Boost banter engagement `Feature` `Design` `Mobile`
- **Is:** Deepen engagement with the pool chat (banter) we already shipped — turn a mostly one-way feed into back-and-forth conversation and lift the share of members who ever post. A cluster of independently-shippable levers, not one build.
- **Why (data 2026-07-19):** organic banter = ~1,383 real typed messages from ~315 people across 118 pools — but only **~7% of members ever type**, **half of chatters post exactly once**, a **~30-person core drives a third** of all chat, and **~67% of the feed is auto "share cards" (badge-flex / standings-drop) that draw almost no replies**. Replies (<1%), @mentions, and reactions-on-text (from ~7 people total) are effectively unused. Activity spikes on match days → it's second-screen behaviour, so match-moment nudges are the biggest lever.
- **Levers (pick + sequence):**
  - **Match-moment push → chat** *(first slice)*: nudge members into banter at live beats (kickoff, goal, red card, full-time, big rank swing) via the existing push infra, deep-linking straight into the pool chat.
  - **Make share-cards conversational:** badge-flex / standings-drop / prediction-share cards should invite an inline reply or one-tap reaction instead of reading as a wall; consider auto-prompts ("Anyone catching Melanie? She just hit L9").
  - **Close the notification loop:** push/notify on @mention + reply so threads continue — today both are silent, so conversations die after one message.
  - **Discoverability:** surface the reaction / reply / @mention affordances on text messages (reactions come from ~7 people — the control is likely hard to find).
  - **First-message activation:** empty-state prompt + a re-engagement nudge for the 50% who posted exactly once.
- **Touches:** banter surfaces (mobile `usePoolBanter.ts` + `BanterSheet`, web `CommunityTab.tsx`); the rich-card types in `pool_messages.message_type` (`badge_flex` / `standings_drop` / `prediction_share`); push/email via `/api/notifications/*` + Resend + the match-day push cron; realtime Broadcast-from-DB infra (migration `022`).
- **Effort:** ~1–2 weeks for the full set; match-moment push ≈ 2–3 days as the first standalone slice.
- **Done when:** the share of members who post and the reply/reaction rate per message both climb against the 2026-07-19 baseline (illustrative targets: text-posters 7% → 15%, replies <1% → 10%).

### Direct messaging (1:1) `Feature`
- **Is:** Private 1:1 messaging between users, separate from pool chat. Today all chat is pool-scoped — no private conversations.
- **Touches:** a new DM data model + inbox UI (web + mobile); reuses realtime broadcast infra.
- **Audit 2026-07-12:** TODO — no DM/conversation table (confirmed no `direct_messages` table); all chat is `pool_messages`.
- **Effort:** ~1–2 weeks.
- **Done when:** two users can hold a private 1:1 conversation outside any pool.

### Admin messaging to pool members `Feature`
- **Is:** Let a pool admin message all members at once — announcements, reminders, nudges. Admins have no group channel today.
- **Touches:** an admin broadcast path → pool chat and/or push/email (reuses `/api/notifications/*` + Resend) + an admin UI entry point.
- **Audit 2026-07-12:** TODO — the only broadcast paths are **super-admin only** (`requireSuperAdmin`); no **pool**-admin → members path exists.
- **Effort:** ~2–3 days.
- **Done when:** an admin can send one message that reaches all pool members via in-app + push/email.

### Friends list `Feature`
- **Is:** Let users add each other as friends and keep a persistent cross-pool connections list. Today relationships only exist inside a shared pool.
- **Touches:** a new friends/relationship model + friend UI (add/list) + cross-pool surfacing.
- **Audit 2026-07-12:** TODO — no `friends` table; every `friend` hit is marketing copy.
- **Effort:** ~1 week.
- **Done when:** a user can add friends and see a persistent list that carries across pools.

### Picture sharing in chat `Feature`
- **Is:** Let players share images/screenshots in pool chat (brackets, results, banter, reactions). Chat is text-only today.
- **Touches:** chat composer + Supabase Storage upload + inline image rendering in the banter/chat list; ties to *Avatars v1* storage work.
- **Audit 2026-07-12:** TODO — banter composer is text + rich cards only; no image picker/upload/Storage bucket.
- **Effort:** ~2–3 days.
- **Done when:** a user can attach and send an image in pool chat and others see it inline.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Chat auto-refresh / live messages `Feature` | Migration `022_banter_realtime_broadcast` (AFTER-INSERT trigger → `realtime.send` to private `pool:{id}`); both mobile `usePoolBanter.ts` and web `CommunityTab.tsx` subscribe to that private channel (`message_insert` + `reaction_insert`/`reaction_delete`) after `realtime.setAuth()`. Web converged onto the DB broadcast 2026-07-13 — dropped its old client-to-client rebroadcast, 5s poll, and `postgres_changes` reactions channel. Both surfaces update live. | Resolves the "back out two screens to see new messages" card. |

## 🎨 Design / UX polish — post-v1

### Migrate transactional emails to the new brand `Design`
- **Is:** Bring the rest of the email system onto the RN-app identity. The two feedback surveys were rebranded 2026-07-21 via a reusable `brandedTemplate()` (`lib/email/templates.ts`) — midnight header, gold accent strip, two-tone **Sport**​**Pool** wordmark (Nunito 900), primary-blue `#3B6EFF` CTA, tokens straight from `mobile/theme/colors.ts`. Every **other** template still renders through the legacy green (`#16a34a`) `baseTemplate()` (and `supportTemplate()` on slate `#1e293b`), so a user's inbox mixes old-green and new-blue Sport Pool mail.
- **Touches:** `lib/email/templates.ts` — repoint each template's `baseTemplate({...})` call to `brandedTemplate({...})` (same param shape, so it's near-mechanical): `deadlineReminderTemplate`, `roundDeadlineReminderTemplate`, `pendingPredictionsReminderTemplate`, `emptyPoolNudgeTemplate`, `soloPoolNudgeTemplate`, `smallPoolBoostTemplate`, `startAPoolTemplate`, `weMissYouTemplate`, `readyToJoinTemplate`, `pastPredictorHypeTemplate`, `bracketFixTemplate`, `pointsAdjustedTemplate`, the `custom` path, and the automated crons. Decide whether `supportTemplate` keeps its distinct "Support" header or folds in too.
- **Watch for:** per-template inline body colours — most bodies hard-code neutral `#525252`; on the new white surface that still reads fine, but sweep for any green (`#16a34a`) accents inside bodies/buttons that would now clash. Semantic colours (`pointsAdjustedTemplate`'s +/- green/red) are intentional — leave them. Re-render each through Resend to a test inbox before shipping; `@import` Nunito degrades to system fonts in Gmail/Outlook by design.
- **Effort:** ~half a day (mechanical swap + a visual pass on all ~15).
- **Done when:** every customer-facing email renders the new brand; no template still calls the green `baseTemplate`.

### Banter sheet polish `Design`
- **Is:** Smooth out the banter sheet — reaction long-press, quick-actions anchoring, and verify share-prediction + badge-flex against real data.
- **Touches:** `mobile/components/.../BanterSheet` + reaction/quick-action components.
- **Audit 2026-07-12:** PARTIAL — sheet is feature-complete (long-press + anchoring wired); remaining is subjective smoothness + real-data verification of share/flex.
- **Effort:** ~1–2 days.
- **Done when:** interactions feel smooth and share/flex render correctly with real data.

### Round / match-week label on upcoming matches (mobile) `Feature` `Mobile`
- **Is:** On the Predictions tab, label each upcoming match with the round it belongs to, using competition-appropriate wording — "Match Week 3" (EPL), "Round of 16" (WC knockout).
- **Touches:** `mobile/components/pool-detail/PredictionsTab.tsx` + `MatchPredictionRow.tsx` / `components/home/UpcomingMatchCard.tsx`; reads round/stage off the match plus lock state.
- **Audit 2026-07-12:** PARTIAL — label infra exists (`usePoolRounds.ts` `ROUND_LABELS`, shown on the entry status pill + wizard headers) but the per-upcoming-match rows carry no round label; wording is WC-only.
- **Effort:** ~0.5–1 day.
- **Done when:** a non-admin member sees the correct round/match-week label on upcoming matches, with wording matching the competition.

### Members' / all predictions after lock `Feature` `Mobile`
- **Is:** An **all-members** feature — once predictions lock, **any** member can see every *other* member's predictions, presented as a **read-only replay of the prediction wizard flow**. Same view on **web** too.
- **Touches:** a new section/list in `PredictionsTab.tsx` + a **read-only reuse of the wizard UI** (`BracketPickerWizard.tsx` / `ProgressivePredictionWizard.tsx`) + a read of all pool entries' `predictions`; plus a web equivalent.
- ⚠️ **Audit 2026-07-12:** PARTIAL — the read-only wizard replay is **built but admin-gated** (`readOnly` prop reached only via `?viewAs=admin` from the admin Members drill-down). Remaining = expose it to **any** member after lock (mobile + web); no web equivalent yet.
- **Effort:** ~1–2 days (mobile) + ~0.5–1 day (web).
- **Done when:** after lock, any member can browse every other member's predictions on mobile and web. ⚠️ Reveal **only after lock**, or it becomes a pre-deadline cheat sheet.

### Tab-swipe jitter (mobile) `Mobile`
- **Is:** Swiping left/right between pool tabs is janky — not clean or smooth.
- **Touches:** the pool-detail tab pager + `mobile/components/pool-detail/PoolTabBar.tsx`. ⚠️ A **different** tab issue (bottom-tab size-pop) was already fixed with `enableScreens(false)` — load-bearing, don't touch; per-tab Reanimated `entering` wrappers + `detachInactiveScreens={false}` were tried and **don't** help.
- **Audit 2026-07-12:** TODO — pager impl is reasonable (Reanimated SharedValue sync) but no fix commit / profiling evidence.
- **Effort:** ~1–2 days (investigation-heavy).
- **Done when:** tab swipes hold ~60fps with no dropped frames on a mid-tier device.

### Chat scroll jitter (mobile) `Mobile`
- **Is:** Scrolling the banter/chat is janky; needs to be smoothed out.
- **Touches:** `BanterSheet.tsx` + `mobile/app/pool/[id]/banter.tsx` + `mobile/lib/usePoolBanter.ts`. Prime suspects: list virtualization, re-renders on every realtime message, scroll inside the gorhom sheet.
- **Audit 2026-07-12:** TODO — `GiftedChat` (inverted FlatList) is the named suspect; only an open-latency mount fix exists, no scroll-jitter/virtualization work.
- **Effort:** ~1–2 days (investigation-heavy).
- **Done when:** chat scrolls smoothly at ~60fps, including while new messages arrive live.

### App-loading splash screen `Design`
- **Is:** Remove the `SP` app-icon flash shown during app open *before* the splash screen — go straight to the splash, or use the same blue. `#SplashScreen`
- **Touches:** app launch/splash config (Expo splash + iOS launch screen).
- **Audit 2026-07-12:** TODO — `expo-splash-screen` + a custom `Splash.tsx` smooth the native→JS handoff, but nothing addresses the pre-splash cold-start icon frame.
- **Effort:** ~0.5 day.
- **Done when:** app open shows a single clean splash (or matching blue) with no stray icon frame.

### On-theme trophies `Design`
- **Is:** Redesign the Form-tab trophies/badges so they fit the app's design system — the current ones work but feel off-theme. `#Achievements`
- **Touches:** badge/trophy visuals in the Form tab. Cross-refs *Form tab polish* + *Badge batch*.
- ✅ **Web SHIPPED 2026-07-13:** all **23** v4 medallions (12 full/progressive + **11 `bp_*`** — the bracket art DID exist, contra the earlier "SF Symbols" note) are web-optimized into `public/badges/` (resized 160px, 588 KB total) and rendered via a shared `<BadgeMedallion>` (emoji fallback for any id without art) in the profile **Trophy Case** + the pool **analytics badge grid** (`XPProgressSection`). Web badges now match the mobile medallions instead of bare emoji.
- **Effort:** ~1–2 days (design + asset pass) — web done; mobile already uses the medallions.
- **Remaining:** mobile Form-tab `bp_*` fallback can now point at the real art (it exists); any badge without a medallion still shows emoji.
- **Done when:** trophies/badges match the design system — done on web; mobile parity for `bp_*` is the tail.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Form tab polish `Design` | `mobile/components/pool-detail/BadgeDetailSheet.tsx` wired into `FormTab.tsx` + `BPFormTab.tsx`; tapping a badge cell opens a sheet showing its earning condition. | — |
| Slide-up save button `Design` `Mobile` | Dirty-state sticky footer — `hasChanges` gates an absolute-positioned `SaveBar` in `SettingsTab.tsx` + `scoring-config.tsx`, with content padding reserved. | — |

## 🐞 Bugs — triage (unsorted severity)

> Captured from the board's "Bug" column. Severity not yet assessed — promote into the sections above as they're triaged.

### Mobile web-export breaks `eas update --platform all` `Bug` `Mobile`
- **Is:** `eas update` with its default `--platform all` fails during the **web** export's static render — `mobile/lib/supabase.ts:16` calls `expo-secure-store`'s `getItemAsync` in a Node context where the native module doesn't exist (`getValueWithKeyAsync is not a function`), aborting the export. Native iOS/Android bundles export fine. Hit during the 2026-07-12 tie-break OTA.
- **Touches:** `mobile/lib/supabase.ts` auth-storage adapter — guard SecureStore behind `Platform.OS !== 'web'` with a web/SSR-safe fallback. Web isn't a shipped Expo surface, so the **interim workaround is `eas update --platform ios` + `--platform android`** (what shipped the tie-break OTA).
- **Effort:** ~0.5 day.
- **Done when:** `eas update` (all platforms) completes without the SecureStore crash.

### Align quick-chat rich cards (web vs mobile) `Bug` `Design` `Mobile`
- **Is:** Rich cards in quick chat render differently on web vs the React Native app; they should look the same. `#BanterChat` `#Mobile`
- **Touches:** rich-card rendering in banter/quick-chat on both web and `mobile/`.
- **Audit 2026-07-12:** TODO — two separate implementations with **divergent metadata contracts** (web writes `entries`/`badges`; mobile reads `top_entries`/`badge_count`), so a card authored on one platform falls back to plain text on the other.
- **Effort:** ~1–2 days.
- **Done when:** a given rich card looks consistent across web and mobile.

### Pending-submissions logic (multi-entry) `Bug`
- **Is:** Fix the "all entries submitted?" logic for pools that allow more than one entry per user — the mobile "pending" notice should account for *all* of a user's entries. `#EntrySubmission`
- **Touches:** the submission-status checks (mobile dashboard notice + related surfaces) for multi-entry pools.
- **Audit 2026-07-12:** TODO — `useHomeData.ts:555` keys `needsPredictions` to the single best entry, not all entries.
- **Effort:** ~0.5–1 day.
- **Done when:** multi-entry pools correctly report submitted vs pending across all of a user's entries.

### Live-update tabs on member removal `Bug`
- **Is:** When a pool admin removes a member, all tabs should live-update — e.g. the Fees tab should immediately reflect the reduced pot. `#DeleteMember` `#LiveUpdates`
- **Touches:** member-removal path + live refresh of dependent tabs. Relates to *Admin member-management actions*.
- ⚠️ **Audit 2026-07-12:** PARTIAL — web `MembersTab` **does** call `/recalculate` (contrary to the board framing); the real gap is **no web realtime `pool_members` subscription** (mobile has one), so other viewers don't live-update. Also mobile removal omits the recalc call.
- **Effort:** ~1 day.
- **Done when:** removing a member updates every affected tab without a manual refresh.

### Match-detail page bug (app dashboard) `Bug`
- **Is:** A reported bug on the match-detail page reached from the app dashboard. Card has no detail.
- **Touches:** TBD — match-detail page in the mobile app.
- **Effort:** TBD — needs repro/specifics first.
- **Done when:** the (to-be-specified) match-detail issue is reproduced and fixed. ⚠️ **Needs specifics before it's actionable.**

## 📱 Mobile

### Pool card: level + form dots wrong (mobile) `Bug` `Mobile`
- **Is:** On the "Your Pools" tab, pool cards show correct **rank** and **points**, but the **Level** doesn't match the pool-detail Form tab and the **form dots** are missing or incomplete.
- **Touches:** two distinct root causes, both spanning `mobile/lib/useHomeData.ts` + `mobile/components/pools/PoolListItem.tsx`:
  - **Level** — the card computes `getLevel(pool.totalPoints)` (a *points*-based table) while the app shows an *XP*-based `current_level`.
  - **Form dots** — built from an unbounded `match_scores` query (`.in('entry_id', allEntryIds)`, no `.limit()`), so entries past PostgREST's 1000-row cap get empty/partial dots.
- **Audit 2026-07-12:** TODO — both root causes confirmed still present; `useHomeData.ts` never reads `entry_xp_state`. **Note:** `entry_xp_state` has `current_level` but **no `last_five` column** — the durable form-dots fix needs it added.
- **Effort:** ~0.5–1 day.
- **Done when:** the card's Level matches the Form tab and form dots render the correct last-5 for every pool. **Durable fix:** source both from precomputed `entry_xp_state` columns (`current_level` + a new `last_five`). Folds into *Leaderboard precompute*.

### Mobile error triage `Mobile`
- **Is:** Deferred residuals from the June error review.
- **Touches:** `user_presence` RLS failures (172k failed inserts); push-cron duplicate-key races (need `ON CONFLICT`); bracket-picks mobile submit gating.
- ⚠️ **Audit 2026-07-12:** PARTIAL — **2 of 3 done**: push-cron dedup ✅ (claim-on-insert pattern across all `push_*_sent` tables), bracket submit gating ✅ (`BracketPickerWizard.tsx:162`). Only `user_presence` RLS remains (a DB-side policy; also ships with the presence OTA).
- **Effort:** ~0.5–1 day (presence RLS only).
- **Done when:** zero presence RLS errors, zero duplicate-key errors, and bracket submit gates correctly on mobile.

### Expo migration eval `Mobile`
- **Is:** Evaluate replacing the Swift iOS app with Expo/RN for iOS + Android (post-WC).
- **Touches:** decision/spike, not a fixed build — assess feature parity + store deployment.
- **Audit 2026-07-12:** TODO (as a formal deliverable) — effectively **in progress**: the `mobile/` Expo app is already the go-forward customer surface; only the written go/no-go is outstanding.
- **Effort:** large — a scoping spike first, then a phased build if greenlit (weeks).
- **Done when:** a go/no-go decision with a scoped plan.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Push + banter notification parity `Mobile` | `usePoolBanter.ts:620/639` call `notifyMessage`/`notifyMention` → `/api/notifications/{message,mention}` (`api.ts:594/575`); comment confirms it matches the Swift app's dual-endpoint behavior. | On-device confirmation after the OTA ship is the only follow-up. |

---

## 🌍 Project: Multi-sport platform

> Generalize the single World Cup product into a reusable multi-competition platform. **Audit 2026-07-12:** the foundations are genuinely **TODO** — the schema is hardcoded to a single tournament (`00000000-…-0001`, 63 files reference `tournament_id`, zero reference any competition abstraction); ingestion is one api-football integration with no adapter; no `pool_templates`/`survivor`/catalog exists.

**Product decisions below were settled 2026-07-25** and are not open for re-debate without a reason.
The *why* is recorded alongside each so the argument doesn't have to be re-run. Research behind them:
competitor UX across 14 platforms, a pool-format taxonomy, and behavioural research on retention and
organiser motivation.

---

### Decision 1 — The durable object is the Crew

A **Crew** is permanent. A **pool** (one crew playing one competition) is time-boxed and archives.
Today those are collapsed into one row — which is why the same group re-assembles from scratch every
season, and why the current `lifecycle` vs `accepting_members` work is harder than it should be (two
lifetimes modelled on one row).

- **Plural.** A person belongs to many crews — work, five-a-side, family. They overlap and have
  different tones. *This is why a single flat "people you've played with" list is the wrong shape:
  it merges distinct social circles.*
- **Keeps history** — all-time record, past seasons, rivalries.
- **Three ways to create, no gate:** (1) at pool creation — *"Save these 12 as a crew?"* — the
  primary path; (2) directly, any time; (3) discovered from a repeat group, as a **fallback**.
- **Captain + co-captain from the start.** Creator is captain. Co-captain exists day one so a crew is
  never frozen behind one dormant person.
- **Captain ≠ pool admin.** Captain owns *people*; a pool admin owns *one season*. Lets the
  season-running role rotate while the crew stays stable — and creates new admins from inside a group
  that already exists.
- **Any member can start a pool**; they become that pool's admin, and it still counts as the crew
  playing (carries crew history).
- **A crew can run several pools at once** — the office does the World Cup *and* March Madness.
- **Removal = "stops getting invited", not "erased".** History survives; the removed person is not
  notified.
- **Banter stays per pool**, not per crew.

### Decision 2 — Crews join a new season by held seat

Crew membership is consent to the **group**, not to every **competition**.

- **Held seat** — a reserved, visible spot (*"your spot's saved, picks lock Friday"*), shown as
  **pending**, not as an entry. **Releases at first lock** if unused, so there are no ghost entries
  on zero and nobody is publicly shown having failed to turn up.
- **Pool stays joinable after first lock** for long competitions — week 3 of 38 is viable; a bracket
  is not.
- *Why:* auto-join makes the **pool** pay (dead leaderboard); invite-only makes the **captain** pay
  (chasing — the second-most-cited reason organisers quit). The held seat makes the **platform** pay.
- **One reminder**, SportPool-branded. **Never in the captain's name** — LinkedIn survived the
  contact import and the first invite in *Perkins*; it lost $13M over reminders sent in users' names.
- **Roster review screen with reasons** ("email bounced", "never picked last season", "dormant 6
  months"). All checked by default except hard failures. A service to the captain, not a chore.
- **Run it back** stays as the one-tap shortcut: carries **the admin's own past setup** (competition,
  format, scoring), with **the crew chosen separately** — so "same setup, different group" is
  first-class. Guard against a crew already playing that competition.

### Decision 3 — The format screen stays, as a one-tap confirmation

- Recommended format **pre-selected**; primary button names it (*"Continue with Score Predictor"*).
  **Skipped entirely** when only one format exists, and by Run it back. Shows crew history.
- *Why keep it:* **the formats are the product.** For a multi-sport app, the fact a league crew can
  play Score Predictor, Last Man Standing or Final Table *is* the range. Hiding it makes SportPool
  look like a one-trick pick'em app.
- **A format is a named preset that carries its own scoring.** The admin chooses a game, never
  assembles one.
- **Crew selection lives on the name screen:** *Name · Crew · Who can join · Create*. "No crew" is
  valid → share-link path, then *"save these people as a crew?"*.

### Decision 4 — Sport filters, tournament ranks

- **Sport is asked once in onboarding** (~9 options, one screen, skippable) — not in the wizard. It
  powers the create picker, Discover, **and** "starting soon" notifications.
- **Filter on by default**, with a visible "Only sports I follow" toggle.
- **Event-driven breakthrough** — a competition punches through only when *starting soon* **and**
  *big*, honestly labelled. **Dismissible for that season.** Deliberately rare: a permanent "other
  sports" shelf becomes furniture.
- **Tournament preference ranks; it never filters.** Chips expand within the same onboarding screen;
  tap nothing and you get the whole sport. *A Premier League fan still wants the World Cup — narrowing
  must never hide a major event in a sport they follow.* Plus "Notify me" per competition, and derive
  the rest from behaviour.

### Decision 5 — Discover lists all public pools

- **All pools set to public are listed** — not a curated shelf. **Quality is a ranking problem, not a
  membership problem:** sort by joinability, share who actually picked, fill velocity, proximity to
  start. Dormant pools are listed but sink.
- **Honest state on every card** — *"Opens 8 Aug · 12 joined"* / *"Live · matchweek 3"* / *"Closed"*.
- **Three-way privacy:** private · **unlisted** *(stays the default)* · **listed** (opt-in).
- **Report path + fast unlist** — a listed pool is content published under our logo.
- **Official SportPool pools per major competition** — always live, guaranteed-good first experience
  for a crewless user, and a controlled surface for testing formats. Branded-pool machinery exists.

### Decision 6 — Scoring: one canonical scale, presets, locked at kickoff

- **100 / 75 / 50 is canonical.** Collapse the three disagreeing default sets into one exported
  constant. See *Scoring config is internally inconsistent* under 🔥 Now.
- **Named, versioned presets for new pools**, replacing the 43-knob surface. *(Assumed: the 622
  existing pools are grandfathered — re-scoring finished pools would be indefensible. Not explicitly
  ruled.)*
- **"Advanced" means a different game, not different numbers** — an admin asking for advanced scoring
  wants a confidence ladder or upset bonus, not `quarter_final_multiplier = 3.7`.
- **Scoring locks at first kickoff**, enforced by a **DB trigger** — mobile writes directly, so the UI
  is not a gate. Same lesson as `trg_enforce_prediction_before_kickoff`. Super-admin override requires
  a written reason and notifies members.
- Comparable scoring across pools is a **hard prerequisite for Showdown** — H2H duels need comparable
  weekly scores.

### Decision 7 — Platform as referee; admin keeps real powers up to kickoff

Admins don't quit from workload. A study of 71 lapsed community moderators found **conflict and time
ranked above workload**, with high emotional exhaustion and low task stress. They quit over the
argument, not the admin panel.

- **Platform enforces** locks, deadlines, round opening, reminders, scoring — **and says so in the
  UI** (*"SportPool locked picks — your commissioner can't change this"*), giving the admin something
  to point at. **Admin chooses** format, preset, roster, tone, house rules.
- Automate the *chores*, never the *choices* — removing judgment and autonomy together turns the
  commissioner into a spectator with a title.
- **Auto round-opening is a prerequisite, not polish.** The progressive World Cup needed super-admin
  bulk updates for 7 rounds; the EPL is 38 matchweeks × every pool.
- **The override wall is kickoff, not the deadline.** Freely allowed up to kickoff: extend a deadline,
  reopen a round for everyone, **reopen for one specific member**, nudge/remove/re-invite. **Nothing
  is accepted after a match starts, by anyone including super-admin.** *The risk isn't that admins
  cheat — it's that they can be accused of it.*
- **Members see the override log** (*"Ryan reopened matchweek 3 for Dave — 14:02, before kickoff"*).
  This **protects** the admin: it's their proof they were fair.
- **Wrong results route to super-admin**, fixed once at source — an admin hand-editing a result would
  create divergent realities across 600 pools.
- **Archive, not delete** — see the 🔥 Now item; Delete Pool is removed from admins entirely.
- **Instrument admin retention.** Currently invisible on every dashboard, and it is the biggest lever
  we found:

  | Path | Yield |
  |---|---|
  | +10% more admins (477 → 525) | +365 players |
  | +10% players per admin (7.6 → 8.4) | +382 players |
  | **Prevent 20% of admin churn (~95 admins)** | **+722 players** |

  An 11.6% organiser rate is ~**ten times** the classic ~1% creator benchmark — an outlier to defend,
  not a funnel to fix. The 478th admin is by construction the person with the smallest, least
  enthusiastic group.

### Decision 8 — The ethical test

The **disclosure gate** (top of this document) is adopted as a real gate, and is recorded in
`CLAUDE.md` (2026-07-25) so it fires when a feature is *proposed* rather than at merge time. The full
five, for genuinely new mechanics:

1. **Disclosure** — would it survive being explained in a tooltip?
2. **Affect** — which emotion does the work, and would the user thank you for it? Anticipation, pride,
   rivalry: fine. Guilt, shame, obligation, manufactured FOMO: not.
3. **Symmetry** — is exit as easy, fast and prominent as entry?
4. **Substitution** — does the user end up with more of what they came for, or just more sessions?
   Pair every mechanic with a quality counter-metric.
5. **Variance provenance** — is every element of uncertainty **inherited from the sport**? Randomness
   *we* add is gambling design whether or not money moves.

Standing check: assume a 15-year-old is in a family pool.

---

### Still open

- **Presets for new pools with existing pools grandfathered** — assumed yes, not explicitly ruled.
- **Crew-departure semantics** — history is immutable, but self-removal and exact removal behaviour
  aren't settled.
- **Where the format recommendation comes from** when crew history and global popularity disagree.
  (Settled for Run it back: the admin's own past setup.)
- **The breakthrough threshold** for out-of-sport events — instinct is deliberately high; the moment
  it fires often it stops working.
- **Discover ranking weights** — signals agreed, formula not.
- **Migration path** from today's `pools` table to Crew + Season without disturbing 622 live pools.
  Biggest unknown in the project.

### Not yet discussed

- The competition-shape × pool-format grid, and which format engines to build in what order.
- Showdown mechanics beyond "no playoff cut, matched pairing".
- Monetisation (tracked separately under 💎).

---

### Foundational work items

- **League ingestion (Premier League)** `Multi-sport` 🔥 — migration `024_multi_competition_league_support.sql`, `lib/integrations/apiFootball/importLeagueSeason.ts` and `scripts/import-league-season.ts` are **drafted, not applied**. ⚠️ **A league pool scores zero today, silently**: `checkKnockoutTeamsMatch` ([lib/scoring/core.ts:88](lib/scoring/core.ts)) returns `true` only for `'group'` or when teams aren't set; a `'regular_season'` fixture is neither, so it falls to `return false` and [core.ts:141](lib/scoring/core.ts) zeroes the match. Even after fixing the gate, `isGroupStage` selects the **point values** — the group/knockout binary is welded into the price lookup, not just the gate. Importing fixtures is **not** the last step before a working league pool.
- **Team advancement is single-tournament** `Multi-sport` 🔒 **(added 2026-07-26 — R16)** — `app/api/admin/advance-teams/route.ts:56` reads `matches`, `teams` and `match_conduct` **tournament-wide with no scope**, because the advancement cascade was written for one competition. With a second competition present, unscoped `matches` would resolve knockout placeholders **across** competitions, and unscoped conduct is capped at 1,000 rows by PostgREST. Carries a blocker comment in-file. The fix is not a query change — it means deriving the tournament from `match_id` (or taking it as a parameter) and threading it through the cascade. **Must land before a second competition is ingested**, i.e. before 024 is applied.
- **Sync cron is single-tenant** `Multi-sport` — competition comes from three env globals (`app/api/cron/sync-fixtures/route.ts:67`). Looping over active tournaments (reading `external_league_id`/`external_season` per row, which 024 backfills) is the unlock for N competitions. WC = api-football league 1; EPL = league 39.
- **Data-model abstraction** `Multi-sport` — competition-instance model, now also carrying Crew + Season (Decision 1). Everything else depends on it.
- **Pool template system** `Multi-sport` — formats as named presets carrying their own scoring (Decision 3).
- **Sports-data ingestion** `Multi-sport` — pluggable fixtures/results/standings layer behind a provider interface.
- **Per-competition email cadence** `Multi-sport` — schedules per competition instead of global crons.
- **Competition catalog & lifecycle** `Multi-sport` — catalog, season rollover, clone-from-last-year. Date-computed state chips, **never authored** (Decision 4).
- **Per-competition branding** `Multi-sport` — theme/copy per sport. (The existing `branded-pools` feature is per-**pool** white-label — a different axis.)
- **Monetization model** `Multi-sport` — free vs freemium vs paid. Tracked under 💎.

## 💎 Later — monetization & cosmetics

### Sponsored pools `Feature` `Monetization`
- **Is:** For self-directed designed pools using the pool-payment model, let "ultra" / paying pools be marked as **sponsored** and pinned to the top of discovery. `#Monetization`
- **Touches:** a `sponsored` flag on pools + discovery sort (pin sponsored to top) + an admin marking path.
- **Audit 2026-07-12:** PARTIAL — the pin-to-top-of-discovery mechanic already ships, but keyed off **branding**, not a `sponsored` flag (`PoolsClient.tsx:289`, `useHomeData.ts:582`). Still need a real `sponsored` flag + paid-tier marking path.
- **Effort:** ~2–3 days.
- **Done when:** a pool can be marked sponsored and reliably appears pinned at the top of discovery.

### Premium analytics `Feature` `Monetization`
- **Is:** In-depth analytics as a paid premium feature — accuracy trends, H2H records, pick patterns, pool history. Deeper than the free analytics.
- **Touches:** an analytics surface gated behind an entitlement/paywall + the underlying stats.
- **Audit 2026-07-12:** TODO — no entitlement/paywall layer; analytics are ungated.
- **Effort:** large — multi-week; gated on a monetization decision.
- **Done when:** a paying user unlocks richer personal analytics not available on the free tier.

### Character avatars + cosmetics IAP `Feature`
- **Is:** Long-term play — a Bitmoji-style character system plus an IAP cosmetics economy (tunnel themes, walkout animations, victory celebrations).
- **Touches:** character rendering + IAP (App Store / Play billing) + cosmetics catalog.
- **Audit 2026-07-12:** TODO — no IAP/cosmetics/character code; also gated on the (unbuilt) Avatars v1.
- **Effort:** large — months; gated on Avatars v1 adoption + a Phase-2 monetization decision.
- **Done when:** *(gated — not scoped until the gate opens)*.

---

## 🧰 Streamlining & tech debt (background)

### Bounded reads & server-side aggregation (app-wide) `Infra`
- **Is:** Background "simplify how the app pulls data" cleanup. Many screens fetch large, unbounded row sets to the client and compute a small summary in JS — risking silent truncation at PostgREST's 1000-row cap and wasting egress + CPU. Move the work into the database. **Excludes scoring** (shadow engine owns that).
- **Touches:** the anti-pattern is an unbounded `.in('col', [manyIds])` with no `.limit()`/`.range()`. Sweep (2026-07-10): **161** `.in()` reads on web vs 53 bounded; **30** vs 7 on mobile. User-facing candidates first: mobile `useHomeData.ts`/`usePoolBanter.ts`/`useMatchDetail.ts`/`useActivity.ts`; web `dashboard`/`pools`/`leaderboard`/`activity`/`poolData.ts`/`entryAnalytics.ts`/`profile`. **Skip** scoring + admin one-offs. Fix menu: RPC + window function, view, precomputed columns, or `.range()` pagination. Do **not** raise `max-rows`.
- **Audit 2026-07-12:** the first, confirmed instance (mobile pool-card in `useHomeData.ts`) is **still unfixed** — nothing from this sweep has landed yet.
- ✅ **First landings, 2026-07-26 (local, uncommitted):** the `match_conduct` family — 13 of 14 unfiltered whole-table reads now scoped and paginated via `lib/matchConduct.ts` — plus `predictions` narrowed to its 8 used columns and three unscoped `teams` reads filtered. That is this sweep's exact anti-pattern, and it was **live inside the scoring engines**. See *⚡ Performance & caching*. `useHomeData.ts` is still unfixed.
- **Effort:** ongoing/background — ~0.5–1 day per site.
- **Done when:** no user-facing screen depends on an unbounded multi-row fetch; re-running the sweep shows hot read paths are all bounded or DB-aggregated.

---

## 🧹 Housekeeping

### iCloud corrupts the local checkout `Infra`
- **Is:** The repo lives in iCloud-synced `~/Documents`, which corrupts build artifacts, spawns `" 2"`/`" 3"` duplicate files, and can even flip a byte in tracked source.
- **Touches:** local dev environment only. Workaround: diagnose build artifacts via a clean `npm ci` in a throwaway worktree first; scan `git diff` for null bytes before committing.
- ⚠️ **Audit 2026-07-12:** the hazard is **live right now** — duplicate `.git/index 2` / `.git/index 3` and `.next/* 2` files are present on disk.
- **Effort:** ~1 hour — move the repo off iCloud.
- **Done when:** the working copy lives outside iCloud sync and phantom build failures stop.

---

## 📎 Reference docs (architecture deep-dives, not backlog items)

- `drafts/2026-07-02_shadow_engine_audit_report.md`
- `drafts/2026-07-05_match_status_display_plan.md`
- `drafts/2026-07-09_scoring_table_architecture_deepdive.md`
- `drafts/2026-07-19_caching_infrastructure_plan.md` — the caching *layer* design; superseded in scope by the two below, still valid as the layer sketch.
- `drafts/2026-07-26_performance_optimization_audit.md` — measured baseline + the four tiers of waste (*⚡ Performance & caching*).
- `drafts/2026-07-26_caching_strategy.md` — layer-by-layer strategy, the pool-size distribution it rests on, and the settled decisions.
- `drafts/2026-07-26_analytics_parity_result.md` — the parity failure and the two-writer root cause (**R13**).
- ~~`drafts/M4_read_path_flip.md`~~ — ⚠️ **missing from the repo** (referenced by *Leaderboard precompute* but never created / was removed — recreate or drop the reference).
