# INCIDENT (OPEN, NOT FIXED) — "Delete Pool" destroys every member's predictions

**Status: live in production. Not mitigated. Documented only, by decision 2026-07-21.**
**Exposure: 458 pools each one admin click away. 6 pools / 41 entries already damaged.**

Found while root-causing why pool `cf3cc9b7-4758-4278-89c3-ba8c9f6988c9` ("FIFA World
Cup 2026", 30 members) had zero predictions during the podium re-score. Unrelated to the
podium bug — see `2026-07-21_podium_remediation_runbook.md`.

---

## Bug 1 — `handleDeletePool` is a non-transactional client-side cascade

`app/pools/[pool_id]/admin/SettingsTab.tsx:232-302` runs **five sequential PostgREST
calls straight from the browser**, with no transaction and no rollback. Predictions go
first, so the irreversible step is also the earliest:

```ts
const entryIds = members.flatMap((m) => (m.entries || []).map(e => e.entry_id))  // EVERY member
await supabase.from('predictions').delete().in('entry_id', entryIds)   // :243 — irreversible
await supabase.from('pool_entries').delete().in('member_id', memberIds) // :256 — silently partial
await supabase.from('pool_members').delete().eq('pool_id', …)           // :268
await supabase.from('pool_settings').delete().eq('pool_id', …)          // :280
await supabase.from('pools').delete().eq('pool_id', …)                  // :292
```

Any failure, closed tab, or dropped connection after step 1 leaves the pool alive with
every member's predictions gone.

### The amplifier: an RLS asymmetry (verified against production)

```sql
select tablename, policyname, cmd, qual from pg_policies
where schemaname='public' and tablename in ('predictions','pool_entries') and cmd='DELETE';
```

| table | DELETE policy | what a pool admin can delete |
|---|---|---|
| `predictions` | `Pool admins can delete predictions` → `is_pool_admin(pm.pool_id)` | **every member's** |
| `pool_entries` | `Users can delete own entries` → `get_user_member_ids()` **only** | **only their own** |

There is **no** admin DELETE policy on `pool_entries`. So step 2 deletes just the admin's
own entry and **returns no error** — RLS filters rows silently rather than raising — and
the flow proceeds believing it succeeded.

**Result:** predictions gone for everyone, entries and `bonus_scores` retained, pool
still listed. Members see a pool that looks normal until it is re-scored, at which point
their totals correctly collapse to zero.

### Evidence

- `pg_stat_statements`: `DELETE FROM "public"."predictions" WHERE entry_id = ANY($1)` —
  **101 calls by role `authenticated`** (a browser JWT, not a server), paired 1:1 with
  `DELETE FROM "public"."pool_entries" WHERE member_id = ANY($1)`, also 101 calls. That
  two-statement signature exists nowhere else in the codebase.
- Perfect correlation with a pool having lost its admin (non-`bracket_picker`):
  **458 pools with a `role='admin'` member → 0 damaged. 13 without one → 6 damaged.**
  All six damaged pools have zero admins.
- `api_perf_log` (covers 2026-07-20 04:27 → now) contains **zero** DELETE-method calls:
  the damage did not come through any API route.
- `pool_membership_events` has no `left` row — the leave / stop-participating routes log
  events; raw client deletes don't.

### Ruled out

Cron 3 `auto-submit-and-archive` (edge function only SELECTs/UPDATEs — no DELETE
anywhere; the only cron DELETE is jobid 14 on `api_perf_log`) · `matches` cascade (all
104 intact) · `pool_entries` re-creation (`created_at` still 2026-05-27 → 06-14) · DB
triggers (`pool_members` and `pool_entries` have none) · super-admin routes (they delete
`bonus_scores` first — 793 survived) · `account/delete` (service_role, own entries only).

### Damage

| pool | mode | entries wiped | notes |
|---|---|---|---|
| `cf3cc9b7…` FIFA World Cup 2026 | progressive | 26 | 793 orphaned `bonus_scores`; **totals restored 2026-07-21 from `_pool_entries_before_20260721`** — cosmetic, will re-zero on any recalc |
| `c4db9d72…` Essence WC Bracket Challenge | progressive | 1 of 7 | 235 preds remain |
| `5061bfb4…` Quiniela legalys & corpus | full_tournament | 5 | |
| `73aa649b…` Reading 2026 world cup | full_tournament | 1 | |
| `b8868a84…` LA QUINIELA MUNDIALISTA | progressive | 1 | |
| `f7a8453b…` Prueba1 | full_tournament | 1 | |

The five small ones date to June — **this has been happening quietly for weeks.**
`cf3cc9b7` is simply the first victim with a large scored leaderboard.

⚠ **Do not detect this with "submitted but zero predictions".** All 84 `bracket_picker`
pools legitimately have zero `predictions` rows (they use `bracket_picker_group_rankings`
/ `_third_place_rankings` / `_knockout_picks`) — that query yields 861 false positives.

---

## Bug 2 — account deletion destroys everything *before* refusing to run

`app/api/account/delete/route.ts` deletes `match_scores`, `bonus_scores`, `predictions`,
`group_predictions`, `special_predictions`, `player_scores` (lines 33-69), then
`pool_entries` (72-78) and `pool_members` (81-85) — and **only then**, at lines 90-103,
checks whether the user still administers a pool and returns 400 *"transfer admin before
deleting"*.

A pool-owning user who attempts account deletion **keeps their account but loses every
membership, entry and prediction across all pools.** The guard must move to the top.

---

## Fixes when this is picked up

**Immediate, zero-deploy mitigation** (verified safe — the policy's *only* consumer is the
Delete Pool button; `account/delete` uses `service_role` and bypasses RLS entirely):

```sql
drop policy "Pool admins can delete predictions" on predictions;
```

Delete Pool then fails loudly at step 1 having destroyed nothing.

**Proper fix:**
1. Replace `handleDeletePool` with a server-side route (`service_role`) doing the whole
   cascade in **one transaction** — ideally a single Postgres function so it is atomic.
   Consider a soft-delete (`pools.status='deleted'`) instead of a hard cascade.
2. Move the admin-ownership guard to the **top** of `account/delete`.
3. Add `ON DELETE CASCADE` from `pool_entries` → `predictions` etc. so one parent delete
   is sufficient and ordering cannot be got wrong.
4. Require a confirmation that states how many members' predictions will be destroyed.
5. Add an ops assertion: alert when a non-`bracket_picker` pool has entries with
   `has_submitted_predictions = true` but zero `predictions` rows.

**Unresolved detail:** step 3 (`pool_members`) *would* have been permitted for all 30 rows
by `Pool admins can delete members`, yet 29 survive — so the run aborted between steps 2
and 3, and the admin's own `pool_members` row went by some other route. Supabase
PostgREST request logs for 2026-07-20 11:50 → 2026-07-21 13:36 filtered on
`DELETE /predictions` and `DELETE /pool_members` retain client IP and JWT `sub` and would
settle it. In `cf3cc9b7` the creator (`pools.admin_user_id` = `05e99af4…`) re-joined as a
plain `player` at 2026-07-21 07:04:38 with a new entry "EmersonEde".
