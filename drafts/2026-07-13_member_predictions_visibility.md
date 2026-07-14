# Member Predictions Visibility — "See everyone's picks after lock"

- **Date:** 2026-07-13
- **Status:** Phase 0 APPLIED + verified in prod (2026-07-13); Phase 1 BUILT + unit-tested; Phase 2 (mobile) BUILT — tsc/eslint clean, NOT runtime-tested (ships via OTA); Phase 3 (web) not started
- **Roadmap item:** `ROADMAP.md:359-364` — "Members'/all predictions after lock" (Feature, Mobile)
- **Memory:** `project_feature_member_predictions_visibility`

---

## 1. Goal

Once predictions lock, any pool member can browse **every other member's** predictions,
presented as a read-only replay of the prediction wizard (group picks, knockout bracket,
etc.). Applies to both web and mobile.

## 2. The one hard rule

> A member must never see another member's picks for any scope they can still change
> themselves. **Reveal only *after lock*.**

Revealing an editable pick is a pre-deadline cheat sheet. Every design choice below serves
this rule, and it is enforced in **two** independent layers (RLS + server route), because
one of them is currently absent.

## 3. Current state (discovery, 2026-07-13)

### 3.1 The predictions table already over-shares (the crux)

The live `predictions` SELECT policy — `"Users can view pool predictions"` — grants **any
member of the pool read access to any entry's score picks**, with no owner check and no
deadline gate:

```
USING ( entry belongs to a pool that I'm a member of )   -- that's the entire check
```

Because mobile reads `predictions` directly through the anon (RLS-bound) client
(`mobile/lib/usePredictions.ts`), this means **today a technically-capable member can pull
any other member's group/knockout picks before kickoff** by querying the DB directly. The
app UI simply never surfaces it. This is a latent pre-deadline leak, independent of this
feature.

By contrast, the `bracket_picker_*` tables are already correct: owner-only (`ALL`) + pool
admins (`SELECT`). No member-to-member visibility. The two prediction modes are in
**opposite** RLS states.

### 3.2 Blast radius of tightening `predictions` SELECT = small (verified)

Every current reader of `predictions` was checked. All survive an owner-or-admin policy:

| Reader | Client | Reads | Survives? |
|---|---|---|---|
| Web `getPoolData` `allPredictions` (leaderboard/analytics) | `createAdminClient()` (service-role) | all entries | ✅ bypasses RLS — `lib/poolData.ts:199-225` |
| `GET .../leaderboard` | `createAdminClient()` | all entries | ✅ `leaderboard/route.ts:137` |
| `GET matches/:id/stats` (crowd) | `createAdminClient()`, aggregates only | all entries | ✅ `stats/route.ts:66-71` |
| `POST .../bonus/calculate` | `createAdminClient()`, admin-gated | all entries | ✅ `bonus/calculate/route.ts:28` |
| `GET .../entries/:id/analytics` | membership-gated → `createAdminClient()` | all entries | ✅ `analytics/route.ts:41-43` |
| Web `page.tsx` viewer's own picks | session (RLS) | own entry | ✅ owner clause |
| Web `PoolDetail.tsx` refresh | session (RLS) | own entry | ✅ owner clause (`:371`, `:490`) |
| Mobile `usePredictions` (own) | anon (RLS) | own entry | ✅ owner clause |
| Mobile admin replay `?viewAs=admin` | anon (RLS) | others' entries | ✅ admin clause (gated to pool admins) |

No non-admin, RLS-bound, cross-entry read exists today. So tightening is a pure security
win with no functional regression.

### 3.3 Mobile is ~80% built, all admin-gated

The chain already exists: `MembersTab` → `member/[memberId]` → `entry/[entryId]?viewAs=admin`
renders any entry's full predictions read-only (`readOnly` props thread through all three
wizard modes). Gates to remove/replace for a member-facing version:

- `MembersTab` is admin-only — `PoolTabBar.tsx:112` (`getVisiblePoolTabs` returns `members`
  only when `isAdmin`).
- The per-entry "View" drill is gated on `currentUserIsAdmin` — `member/[memberId].tsx:534`.
- The read-only viewer has **no read-time lock filter** and is labeled "Admin view."

### 3.4 Web has no "whose entry" concept

Predictions tab is hard-scoped to `currentMember.entries` (`page.tsx:70`). Single-entry
pools auto-show the viewer's own picks with no selection step; multi-entry pools go through
`EntriesListView` (viewer's own entries only). No header ever says whose entry it is.

## 4. Decisions (Ryan, 2026-07-13)

1. **Web navigation = "stop screen, post-lock only."** Before the deadline, the Predictions
   tab behaves exactly as today (single-entry auto-shows your picks — zero extra taps).
   *After* the deadline it switches to a selection landing listing your entry(ies) **plus**
   an "Everyone else" section. The stop screen appears precisely when there's someone to view.
2. **Anti-cheat = airtight.** Tighten the RLS policy **and** serve reveals through a
   lock-checked server route. Not UI-only.

## 5. Reveal-gate spec

A single predicate, `isEntryRevealable`, is the only place the rule lives.

- **full_tournament & bracket_picker:** whole entry revealable once `now ≥ pools.prediction_deadline`.
  (World Cup deadline is a single moment before match 1, so the whole entry reveals at once —
  matches existing copy: `HowToPlayTab.tsx:165`, "After the deadline, predictions become
  visible to all pool members.")
- **progressive:** per-round — a round's picks revealable once that round is locked
  (`pool_round_states.state` in `locked/in_progress/complete`, or its `deadline` passed).
  Earlier rounds reveal while later rounds stay hidden.

Property: the predicate never returns true while the scope is still pool-wide editable
(before the deadline nothing is shown; after it, auto-submit has locked everyone). The
viewer's **own** entry is exempt — always visible to its owner.

## 6. Architecture & phased plan

### Phase 0 — Close the RLS hole (standalone, ships first)

Replace the permissive `predictions` SELECT policy with the owner-or-admin shape the
`bracket_picker_*` tables already use. Staged in
`drafts/2026-07-13_predictions_select_rls_tighten.sql`.

- DROP `"Users can view pool predictions"`
- CREATE `"Users can view own predictions"` (SELECT, owner)
- CREATE `"Pool admins can view all predictions"` (SELECT, pool admin)

Safe to ship before any UI (§3.2). This alone closes the pre-deadline leak.

**APPLIED to prod 2026-07-13** via `apply_migration` (`tighten_predictions_select_rls_owner_admin`).
Verified by impersonating real pool members in rolled-back txns:

| Impersonated | Own entry | Other player's entry | Admin's entry |
|---|---|---|---|
| Non-admin (player) | 104 ✅ | **0** ✅ (leak closed) | 0 ✅ |
| Pool admin | 104 ✅ | 104 ✅ (replay preserved) | — |

`pg_policies` now shows exactly two SELECT policies (own + pool-admin); permissive one gone.
Security advisor: no notices against the `predictions` table.

**Adjacent finding (not a leak):** the security advisor flags `get_predictions_by_stage()` as a
SECURITY DEFINER function executable by `anon`/`authenticated`. Inspected — it returns only
`(stage, count)` global aggregates, no rows / no entry_ids, so it does NOT bypass the tightened
policy in any meaningful way. Its advisories (mutable `search_path`, anon-executable) are
pre-existing hygiene, tracked as a minor follow-on, not part of this feature.

### Phase 1 — Reveal-gate + one server route (shared spine) — BUILT 2026-07-13

- **`lib/predictions/revealGate.ts`** (pure, unit-tested — 14/14 in
  `lib/predictions/__tests__/revealGate.test.ts`):
  - `computeReveal(pool, roundStates, now): RevealResult` — full_tournament &
    bracket_picker → `{revealed, scope:'all'}` once past `prediction_deadline`;
    progressive → `{scope:'rounds', roundKeys}` for locked rounds only. Fail-safe
    on null/unparseable deadlines.
  - `filterRevealedPredictions(preds, reveal, matchStageById)` — drops score picks
    whose match stage (== progressive round_key) isn't a revealed round.
- **`GET /api/pools/[pool_id]/entries/[entry_id]/predictions`** (modeled on the
  membership-gated breakdown route): member check → entry-in-pool check → owner
  profile (for the "whose entry" header) → reveal gate → picks via `createAdminClient()`.
  Owner + pool admins bypass the gate (always read in full, matching existing admin
  capability); everyone else gets `403 {locked:true}` for unrevealed scopes. Returns
  `predictions` for score modes / `bracketPicks` for bracket_picker. Typechecks + lints clean.
- NOTE: not yet exercised over HTTP (no client calls it until Phase 2/3 wire one up);
  gate logic is covered by the unit tests, auth/DB plumbing mirrors the verified breakdown route.

### Phase 2 — Mobile (un-gate + reuse viewer) — BUILT 2026-07-13

Ryan's UX calls: **flat list of entries** (row per entry, labelled by owner) and
**show-it-locked** before reveal (teaser state for discoverability).

- `mobile/lib/api.ts` — `fetchEntryPredictionsView(poolId, entryId)` → the Phase-1 route.
- `usePredictions` — new `{ spectate }` option: sources picks from the route (not the
  `predictions` table, which RLS now blocks for others) and disables all writes. Covers
  **full_tournament + progressive** (both read this hook).
- `useBracketPickerPredictions` + `BracketPickerWizard` — same `{ spectate }` swap → **bracket_picker**.
- `entry/[entryId].tsx` — `viewAs=member` ⇒ spectate + read-only; `StatusLine` gains a
  spectator variant ("Viewing X's picks"); owner name passed via the `owner` query param.
- `useMemberRoster` — now exposes per-member `entries` (id/name/points/submitted).
- `PredictionsTab.tsx` — "Everyone's predictions" section: flat, owner-labelled rows
  (excludes your own entries); tappable once `everyoneRevealed`, muted "unlocks when
  predictions close" teaser before that. Deadline threaded from `pool/[id].tsx`.

**Verification:** mobile `tsc` clean on all changed files; `eslint` 0 errors; web reveal-gate
unit tests 14/14. **NOT runtime-tested** — no simulator here; mobile ships via OTA on Ryan's
schedule, so on-device is his gate. Eyeball especially: the section's locked→unlocked
transition, the spectator owner header, and progressive per-round reveal.

**Bug found + fixed during Phase 2:** the Phase-1 web helper (and mobile) used round state
`'complete'`; the real DB vocabulary is `'completed'` (open/locked/in_progress/completed). Fixed
in `lib/predictions/revealGate.ts` + its test + the mobile check — the mobile typecheck caught
what the web tests missed.

**Deferred polish:** progressive & bracket_picker spectate views don't yet show an owner-name
banner inside their full-screen wizards (full_tournament does, via StatusLine); a fast-follow
that needs editing those two wizards' headers.

### Phase 3 — Web (post-lock stop screen)

In `PoolDetail.tsx`:

| Pool | Pre-lock (unchanged) | Post-lock (new) |
|---|---|---|
| Single-entry | auto-shows your picks | **stop screen**: "Your entry" + "Everyone else" |
| Multi-entry | `EntriesListView` (your entries) | same list **+ "Everyone else"** section |

- Reuse `EntryDetailView` → `PredictionsFlow` (already read-only) for rendering; feed a
  selected member's `entry_id` from the Phase-1 route.
- Add the owner header web currently lacks.
- `allPredictions` is already in memory for the group-stage overlay, but *other* members'
  full picks route through the gated endpoint so the lock rule stays server-enforced.

### Recommended order

Phase 0 → 1 → 2 (mobile, ~80% built, roadmap-tagged Mobile) → 3 (web). Phase 0 is worth
doing on its own.

## 7. Cross-cutting

- **bracket_picker** already RLS-locks correctly → Phase 0 skips it; the reveal route gates it.
- **progressive** reveals per-round (richer than full_tournament's single moment). Sequence
  the web per-round chrome after the full_tournament path works.
- **Owner identity header** is a shared new UI concern on both platforms.

## 8. Testing

- Unit tests on `isEntryRevealable` — the anti-cheat property (never revealable while
  pool-wide editable), across all three modes and pre/post deadline.
- Manual two-account pass per mode, crossing the deadline, confirming: locked → `403`;
  unlocked → correct read-only render with the right owner header; own entry always visible.
- After Phase 0 apply: smoke-test web leaderboard/analytics (admin-client, expected
  unaffected), own-entry view/edit, and the admin replay (both platforms).

## 9. Open questions / follow-ons

- Super-admin SELECT on `predictions`: the current permissive policy already required
  membership, so dropping it removes no super-admin capability (web super-admin reads go
  through service-role). Phase 0 intentionally omits a super-admin clause to preserve exact
  current behavior. Revisit only if a mobile super-admin anon cross-member read is ever added.
- Should the web "Everyone else" list live on the Predictions tab only, or also be reachable
  from a leaderboard row ("view full predictions")? Deferred; leaderboard already drills to
  the scored breakdown.
