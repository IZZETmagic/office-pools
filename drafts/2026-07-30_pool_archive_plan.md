# Plan — replace "Delete Pool" with a reversible archive (R1)

**Status:** DRAFT — awaiting Ryan's approval. No code written.
**Date:** 2026-07-30
**Closes:** R1 (Delete Pool destroys members' predictions) · R10 (archive decision vs schema)
**Does NOT close:** R12 (membership exit purges the entry) — separate fix, see §7.

Implements the decision of 2026-07-25: *"Delete Pool is removed from admins entirely, replaced with a
reversible archive that keeps history; true deletion becomes a support action."*

---

## 1. Where this diverges from the programme, and why

R10 frames the blocker as *"`pools.status` is CHECK-constrained to `('open','completed')`, so an
`archived` state is impossible without another migration"* — which implies adding `'archived'` to the
status enum. **This plan does not do that.**

`status` describes the **competition lifecycle** (is this pool's tournament running or finished).
Archive describes **visibility** (does the admin want it out of the way). They are orthogonal — a pool
can be completed *and* archived — and collapsing them loses information. It is also the cause of the
current mess: `handleArchivePool` ([SettingsTab.tsx:222](../app/pools/[pool_id]/admin/SettingsTab.tsx:222))
sets `status: 'completed'`, so today's "Archive" button is a lie that overwrites lifecycle state.

**Instead: `pools.archived_at timestamptz NULL`, a separate column. `status` is left alone.**
Restore is `archived_at = NULL`. R10 should be re-worded to match.

No 30-day purge clock. Trash-with-expiry exists to solve a storage-cost problem this product does not
have, and an expiry timer on *other people's* season history is the wrong default.

---

## 2. Prod facts this is built on (verified 2026-07-30)

| Fact | Value |
|---|---|
| `pools_status_check` | `('open','completed')` — unchanged |
| Pool status counts | **610 open, 13 completed** (final was 16 Jul, so status tracks little today) |
| `archived_at` / `deleted_at` columns | **none exist anywhere** in the schema |
| Entries / predictions | 4,981 / 287,789 |
| Orphan predictions | 0 — the cascade leaves nothing behind |
| Level scope | **per-entry** (`entry_xp_state.entry_id`), never global |

---

## 3. The current delete, and a second bug in it

[SettingsTab.tsx:249-296](../app/pools/[pool_id]/admin/SettingsTab.tsx:249) runs a **five-step
client-side cascade** from the browser on the user's own token:

`predictions` → `pool_entries` → `pool_members` → `pool_settings` → `pools`

**It is not atomic, and it deletes the irreplaceable thing first.** Each step returns early on error.
A failure at step 3 would leave **every prediction destroyed and the pool still standing**.

✅ **Checked in prod 2026-07-30 — this has not happened.** The precise test: derived scores can only
exist if predictions once existed, so an entry with `match_scores`/`bonus_scores` rows and zero
surviving predictions is a stranded half-delete. **Zero such entries exist** across all 623 pools and
all three prediction modes. (654 entries have no picks at all, but only 35 are marked submitted, and
none of those carry scores — they are people who joined and never predicted, which is normal.)

So the defect is **latent, not realised**: the code can strand a pool, it just hasn't yet. Removing
the delete path removes the possibility, so no separate remediation is needed.

Mobile is a second door: a single `supabase.from('pools').delete()` at
[SettingsTab.tsx:223](../mobile/components/pool-detail/SettingsTab.tsx:223), relying entirely on the
DB cascade.

---

## 4. Design

### 4.1 Enforcement is in the database, not the clients

Mobile talks to Supabase directly, so an application-layer filter is not a control — the same
reasoning that made `trg_enforce_prediction_before_kickoff` a DB trigger. Archived-ness is enforced by
**RLS**, and the client filters are a UX nicety on top, not the guarantee.

Filtering at N read sites is this codebase's documented failure mode. One missed filter leaks
archived pools forever.

### 4.2 Archived pools keep scoring

They are hidden, not frozen. Stopping the scoring sweep for archived pools would make **restore**
require a backfill, and re-introduce exactly the "stale precompute" class we keep paying for.
610 pools already sweep; hiding a few changes nothing measurable.

### 4.3 Where it lives — Profile, out of the way

Per Ryan 2026-07-30. Web `app/profile/ProfilePage.tsx`, mobile `mobile/app/(tabs)/profile.tsx` — both
already exist and both already host the Trophy Case.

Archived pools are visible **read-only to every member**, not just the admin, showing **who archived
it and when**. A pool silently vanishing for fourteen people fails the disclosure gate; naming the
actor and the date is the honest version and costs nothing.

### 4.3a Members are notified — decided by Ryan 2026-07-30

Not just a passive Profile entry: members are actively told. **There is an exact precedent to model
on** — `app/api/notifications/member-removed/route.ts`, which is the same class of event (an admin
action that changes a member's standing without their input). It does three things, and archive
should do the same three:

1. **`pool_membership_events` row** — `event_type: 'archived'`, with `actor_user_id`, so the action
   is on the record. (Restore writes `'restored'`.)
2. **Email** via `TOPICS.ADMIN`
3. **Push** via category **`ADMIN`** — *"Settings changed, points adjusted, member actions"*, which
   already exists, already has a per-user opt-out, and already mirrors the email topic

Copy must use the plural voice (*"we/us/our"*, never *"I/me/my"*) — house rule. Draft:

> **Pool archived** — *"{Admin} archived {Pool name}. Nothing is lost: you can still see it under
> Profile → Archived, and it stops counting toward your trophies until it's restored."*

That sentence **is** the mechanism, stated plainly, so it passes the disclosure gate on its face.
The admin who performed the action is excluded from the fan-out.

### 4.4 Excluded from all aggregates until restored

Per Ryan 2026-07-30. `badge_unlocks` stays **append-only** — we filter at *read*, we do not delete
rows, which is what makes restore exact.

Surfaces that aggregate across pools and therefore need the filter:

| Surface | File | Today |
|---|---|---|
| Trophy Case (web) | `app/profile/ProfilePage.tsx:365` | `badge_unlocks` by `user_id`, all pools |
| Trophy Case (mobile) | `mobile/app/(tabs)/profile.tsx:1569` | same |
| Dashboard totals | `app/dashboard/page.tsx:380` | already filters `status==='open'` — add `!archived_at` |
| Dashboard activity feed | `app/dashboard/page.tsx:~389` | explicitly "all pools, not just active" |
| Pools list XP | `app/pools/page.tsx:96` | `entry_xp_state` read |

Two useful precedents already in the code: the dashboard **already** excludes non-open pools from
`totalPoints`, and `top_dog` is **already** filtered out of trophies as transient
(`TRANSIENT_BADGE_IDS`). This is a familiar shape, not a new concept.

⚠️ Note `app/dashboard/page.tsx:376` filters on `status === 'open' || status === 'active'` —
**`'active'` is not a valid status** under the CHECK constraint. Dead clause; remove it while here.

---

## 5. Work

| # | Step | Notes |
|---|---|---|
| 1 | Migration `040_pool_archive.sql` — `pools.archived_at timestamptz NULL` + index | Additive, reversible |
| 2 | RLS: archived pools invisible to non-admins; admins see them only in the archive view | The actual guarantee |
| 3 | **Drop the `predictions` admin-delete policy** (`add_admin_delete_predictions_policy`, 20260215211101) | This alone kills R1's blast radius |
| 4 | Remove Delete Pool from web + mobile Settings | Both doors |
| 5 | Make Archive real — set `archived_at`, stop writing `status:'completed'` | Fixes the lie |
| 6 | Profile → Archived pools section, web + RN: read-only, who/when, **Restore — admin-only** | §4.3 |
| 7 | Add `archived_at IS NULL` to the five aggregate surfaces in §4.4 | §4.4 |
| 8 | `POST /api/notifications/pool-archived` — event row + email + `ADMIN` push, modelled on `member-removed` | §4.3a |
| 9 | True deletion → service-role script, one transaction, support-only | Replaces step 4's capability |

Steps 1–4 close R1. 5–9 are the experience around it. Roughly a day and a half.

**Ships behind nothing** — there is no flag needed; removing a destructive button is not a risky
rollout. Migration first, then code (the 07-28 lesson: migration **before** the code that names the
column — 7h of silent 400s).

---

## 6. Decisions — settled 2026-07-30

1. ✅ **Members are told.** Ryan's call. Not just the passive Profile entry — an active
   notification, see §4.3a. *(I had recommended the passive version; overruled, and the stronger
   answer is the right one — a trophy count dropping with no explanation is the "bad feeling" the
   vision exists to prevent.)*
2. ✅ **Restore is admin-only.** Ryan's call. Support handles true deletion only.
3. ⚪ **The 13 already-`completed` pools — proceeding on my recommendation unless you say otherwise:**
   inspect before touching. We cannot now distinguish "the tournament finished" from "an admin
   pressed the Archive button that writes `completed`", so a blind backfill would invent history.
   They stay as-is; I will report what the inspection shows.
4. ⚪ **No typed confirmation for archive — proceeding on my recommendation unless you say otherwise.**
   Delete has one (`deleteConfirmName !== pool.pool_name`) because it was irreversible. Archive is
   reversible, so a plain confirm plus an undo toast is right; typed confirmations on reversible
   actions just train people to type names, which weakens them where they matter.

---

## 7. What this does NOT fix

**R12 stands untouched.** Three of the four membership-exit doors contain no application code at all
— the destruction is a pure DB cascade from `pool_members` / `users`. An `archived_at` column on
`pools` does not reach them. R12 needs its own fix and is gated on **Gate A2** (what leaving a pool
should do to a member's history), which is still open.

Do not let "we shipped soft delete" read as "the destruction class is handled." It is one door of five.
