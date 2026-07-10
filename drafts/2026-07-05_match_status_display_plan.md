# Match status display (postponed / cancelled / delayed / suspended)

**Date:** 2026-07-05
**Author:** planning doc for Ryan
**Status:** proposal — not started
**Surfaces:** mobile Next Kickoff card, match detail, results tab (web parity noted)

---

## Goal

When a match is postponed, cancelled, delayed, or suspended (weather, etc.), show the
**reason as a badge above the time / countdown** on:

1. Next Kickoff card (dashboard)
2. Match detail screen
3. Results (matches) tab

API-Football already reports these; today we throw the detail away in our sync mapper and
have no UI for it.

---

## Current state (why it doesn't work today)

Three chokepoints, front to back:

1. **Mapper collapses 20 API statuses → 4.** `lib/integrations/apiFootball/mappers.ts:37`
   ```
   FT/AET/PEN                    → completed
   1H/HT/2H/ET/BT/P/INT/LIVE     → live
   CANC/ABD/WO                   → cancelled
   everything else               → scheduled     ← PST, SUSP, TBD, AWD land here
   ```
   - `PST` (postponed) is stored as `scheduled` → card keeps counting down to a stale time.
   - **Bug:** `SUSP` (suspended mid-match) also maps to `scheduled`, so a suspended live
     match flips *backwards* from live → scheduled.

2. **DB CHECK constraint** on `matches.status` allows only
   `scheduled | live | completed | cancelled` (`matches_status_check`, confirmed live).
   Current data: 91 completed, 13 scheduled, 0 cancelled.

3. **No mobile render path.** `MatchResultRow.tsx:62` branches only `live` / `completed` /
   else-show-time; `NextKickoffCard.tsx:23` counts down from `matchDate` with no status check.

### The "delayed" caveat

There is **no `DELAYED` status** in API-Football. A delay manifests as either:
- **kickoff time moves** → `fixture.date` changes (a weather push-back), or
- **`PST`** (indefinite) / **`SUSP`** (already kicked off).

We already rewrite `match_date` for not-yet-started matches in the daily
`reconcile-schedule` cron (`lib/integrations/apiFootball/reconcile.ts`), so the countdown
auto-retargets — but silently and only once a day. "Delayed" therefore has to be
**synthesized** by us (detect that kickoff moved), unlike Postponed/Cancelled/Suspended
which come straight from the feed.

### Coverage / timing gap

- **Live sync** (`app/api/cron/sync-fixtures`) runs every minute but only in a window
  **30 min before → 4 h after** kickoff, and **never writes `match_date`**.
- **Reconcile** runs **daily** and **never writes `status`**.

So a weather postponement announced ~3 h pre-kickoff wouldn't surface until ~30 min before.
Addressed in the reconcile/live-sync edits below.

---

## Design decision: add `status_detail`, don't overload `status`

**Recommended:** keep `status` as the coarse 4-value lifecycle (it drives every
`.eq('status',…)` query + all scoring/leaderboard logic — leave it alone) and add a nullable
detail column for the reason.

```sql
ALTER TABLE matches ADD COLUMN status_detail text;          -- null in the normal case
ALTER TABLE matches ADD COLUMN original_match_date timestamptz;  -- set when a delay moves kickoff
```

**Why this over widening `status`:**
- A postponed/delayed match stays `status='scheduled'`, so it **keeps flowing into the Next
  Kickoff card and results list with zero query changes** — we just decorate it.
- A suspended match stays `status='live'`, so it stays in the live section.
- Nothing in scoring/leaderboards ever sees a new enum value.
- The existing `matches_status_check` **does not need to change** (coarse status stays within
  the 4 allowed values).

Rejected alternative — add `'postponed'`/`'suspended'` to `status`: fewer columns, but ripples
into every status filter (`useHomeData` upcoming/live queries, `poolData.ts`, scoring
completion checks) for no product gain. Higher risk.

### Canonical mapping

| API `short` | coarse `status` | `status_detail` | Badge label | Notes |
|---|---|---|---|---|
| `NS` | scheduled | `null` | — (countdown) | |
| `TBD` | scheduled | `tbd` | **Time TBD** | |
| `1H HT 2H ET BT P` | live | `null` | — (live score) | |
| `INT` | live | `interrupted` | **Interrupted** | already coarse=live |
| `SUSP` | live *(bugfix)* | `suspended` | **Suspended** | add `SUSP` to LIVE_STATUSES |
| `FT AET PEN` | completed | `null` | — (final score) | |
| `PST` | scheduled | `postponed` | **Postponed** | stays in upcoming flow |
| _(kickoff moved, pre-KO)_ | scheduled | `null` (derived) | **Delayed** → new time | **not** a `status_detail` value — derived client-side from `original_match_date` (reconcile-owned) so live sync + reconcile never write the same column |
| `CANC` | cancelled | `cancelled` | **Cancelled** | |
| `ABD` | cancelled | `abandoned` | **Abandoned** | |
| `AWD` / `WO` | _(unchanged)_ | `awarded` / `walkover` | **Awarded** / **W/O** | rare; label only, no scoring change this PR |

---

## Product decisions (recommended defaults baked in — override if you disagree)

1. **Next Kickoff card when the imminent match is abnormal**
   - **Postponed / Delayed / TBD → show that match with the badge** (Postponed = no countdown;
     Delayed = badge + retargeted countdown). Stays `status='scheduled'`, so it's naturally
     the "next" card.
   - **Cancelled / Abandoned → skip to the next playable match.** Coarse `status='cancelled'`
     is already excluded from the upcoming query, so this happens for free.
2. **Build "Delayed" now?** → **Yes, but as the last slice.** It's the only piece needing the
   reconcile change + `original_match_date`. Postponed/Cancelled/Suspended are cheaper and
   cover the common cases; ship those first.
3. **Badge colors** (default): Postponed / Delayed / TBD = **amber**; Suspended / Interrupted =
   **orange**; Cancelled / Abandoned = **red**. Wording as in the table above.

---

## Work breakdown

### Slice 1 — DB migration — ✅ written (`lib/migrations/021_match_status_detail.sql`), apply pending

- Adds `status_detail text` + `original_match_date timestamptz` (both nullable, idempotent
  `ADD COLUMN IF NOT EXISTS`).
- `matches_status_detail_check` CHECK allows
  `postponed | tbd | suspended | interrupted | cancelled | abandoned | awarded | walkover`
  (or NULL). **No `delayed`** — that's derived from `original_match_date`, never stored here.
- `v_matches` recreated with `CREATE OR REPLACE VIEW`, the two columns **appended at the end**
  (Postgres forbids re-ordering existing view columns, so no `DROP VIEW` needed / no dependency risk).
- `status` and the existing `matches_status_check` are **untouched**.
- **Apply to prod pending an explicit go-ahead** (additive + reversible, but it's the live WC DB).
  Must land **before** the Slice 4 deploy so the mapper's writes have a column to target.

### Slice 2 — Backend mapper (`lib/integrations/apiFootball/mappers.ts`) — ✅ done

1. `LIVE_STATUSES`: added `'SUSP'` (fixes the suspended→scheduled regression).
2. Added exported `mapStatusDetail(short): MatchStatusDetail | null` (+ the `MatchStatusDetail`
   union). Pure API-derived; **does not** produce `'delayed'`.
3. Extended `MatchUpdatePayload` with `status_detail?: MatchStatusDetail | null` and `OurMatchRow`
   with `status_detail: string | null`, so `fixtureToMatchUpdate` diffs it like every other field
   (no-op guard at line ~108 still applies).
4. In `fixtureToMatchUpdate`, diff `mapStatusDetail(...)` vs `current.status_detail`. Writing
   `null` here is intentional — it **clears** the badge when a suspended/interrupted match resumes.
   No "don't clobber delayed" hack needed, because delayed lives in a different column
   (`original_match_date`, reconcile-owned).
5. Added `status_detail` to the sync route's current-matches SELECT
   (`app/api/cron/sync-fixtures/route.ts:117`).
6. Tests: `lib/integrations/apiFootball/__tests__/mappers.test.ts` (26 cases — full status table,
   SUSP regression, resume-clears-detail, no-op). Passing; tsc + eslint clean on touched files.

### Slice 3 — Reconcile ("delayed" derivation) (`lib/integrations/apiFootball/reconcile.ts`)

Inside the loop where `timeChanged` is detected (line ~122), when a not-yet-started match's
kickoff moves:
- Set `original_match_date = m.match_date` **if currently null** (preserve the first-known time).
- If the new API time equals `original_match_date` (moved back) → clear it (`original_match_date = null`).
- **Do not touch `status_detail`.** "Delayed" is derived client-side from
  `original_match_date != null` (Slice 5 helper), so live sync and reconcile stay in separate columns.
- **Only** record a delay when the move is "delay-shaped" (default: same calendar day, or within
  24 h of the old kickoff). A months-out schedule correction stays a silent `match_date` fix —
  no `original_match_date`, no badge. Threshold is a tunable const; call it out in review.

Also sync `status_detail` for `PST` / `CANC` / `TBD` on upcoming matches here (reconcile already
pulls the whole season feed), so an **advance** postponement lands within a day rather than
waiting for the 30-min live window.

**Optional (near-real-time delays):** within the live window, let the sync route also write
`match_date`/`original_match_date` when `fixture.date` shifts pre-kickoff. Catches same-day
weather delays in minutes instead of a day. Flag as fast-follow if not in v1.

### Slice 4 — Redeploy backend

Deploy the sync + reconcile route changes (Vercel). No cron schedule change required unless we
opt into more frequent match-day reconcile (decision 2 / optional above).

### Slice 5 — Mobile shared helper (OTA-able, no native build)

New `mobile/lib/matchStatus.ts` — single source of truth for label + color:
```ts
export type StatusBadge = { label: string; tone: 'amber' | 'orange' | 'red' } | null;
export function getStatusBadge(m: {
  status: string;
  statusDetail: string | null;
  originalMatchDate: string | null;   // set → derive "Delayed" when not started & no other detail
}): StatusBadge
```
Precedence: an explicit `statusDetail` (postponed/cancelled/suspended/…) wins; otherwise if
`originalMatchDate` is set and the match hasn't started, badge **Delayed**; else no badge.
Consumed by all four surfaces so wording/colors never drift.

### Slice 6 — Mobile data plumbing

Add `status_detail`, `original_match_date` to each `MATCH_SELECT` **and** the realtime UPDATE
patch mappers (realtime already patches `matches` UPDATEs, so flips propagate live):
- `mobile/lib/useHomeData.ts` (`MATCH_SELECT` ~line 151; upcoming query already includes
  `scheduled`, so postponed/delayed flow in unchanged).
- `mobile/lib/useTournamentMatches.ts` (`ResultsMatch` type ~line 8 + select + realtime patch).
- `mobile/lib/useMatchDetail.ts` (`MATCH_SELECT` line 67 + realtime patch).
- Add `statusDetail`, `originalMatchDate` to the `MatchSummary` / `ResultsMatch` / detail types
  and their snake→camel mapping.

### Slice 7 — Mobile rendering

- **`NextKickoffCard.tsx`** — above the countdown block (line ~123): if `getStatusBadge()` is
  non-null, render the pill. Postponed/Cancelled/TBD → replace countdown with the label;
  Delayed → show pill + countdown to the new `matchDate` (optionally "was {originalMatchDate}").
- **`MatchResultRow.tsx`** — add branches before the `else` time fallback (line ~202): render the
  badge in the center 74px column in place of the time.
- **Match detail header** (`app/match/[matchId].tsx`) — show the badge prominently near
  teams/date.

### Slice 8 — Web parity (separate, note only)

Same DB/mapper change already benefits web. Add the badge to the web match surfaces reading
`v_matches` / `poolData.ts`. Keep out of the mobile PR; track separately.

---

## Status — 2026-07-05

- ✅ **Slice 1** migration written **and applied to prod** (`021_match_status_detail.sql`;
  columns + CHECK + `v_matches` verified live).
- ✅ **Slice 2** mapper (`status_detail` + SUSP bugfix) + unit tests (26).
- ✅ **Slice 3** reconcile "Delayed" via `original_match_date` (imminent-move only).
- ✅ **Slices 5–7** mobile helper + `<MatchStatusBadge>` + data plumbing (3 hooks) + render on
  Next Kickoff card, results row, match-detail header. tsc + eslint clean.
- ⏳ **Slice 4 deploy** — web/API changes (mapper, reconcile) are committed-pending; take effect
  on the next Vercel deploy. Mobile loads via `expo start` (Metro) or an EAS Update to the
  `development` channel — Ryan controls OTA timing (coordinate with the staged OTA batch).
- ⏳ **Slice 8 web parity** — mirror the badge on web surfaces (`v_matches` already carries the
  columns). Follow-up.
- ⏳ **Optional** near-real-time delay sync in the live window (Slice 3 note) — deferred.

**Visual verification:** no badges appear until a match is actually postponed/delayed. To eyeball
the UI, temporarily `UPDATE matches SET status_detail='postponed'` on one scheduled match and
revert — but that's live data on prod, so do it deliberately.

---

## Testing / verification

- **Mapper unit test:** `mapStatus` + `mapStatusDetail` for all 20 shorts (esp. SUSP→live/suspended,
  PST→scheduled/postponed). Confirm `fixtureToMatchUpdate` returns `null` when nothing but
  `last_synced_at` changes (no phantom writes — the line 108 rule still holds with the new field).
- **Manual DB flip:** on a staging/scheduled match, `UPDATE matches SET status_detail='postponed'`
  and confirm the badge appears live (realtime) on all three surfaces without a refetch.
- **Reconcile dry-run:** `reconcile-fixture-times-oneoff.ts` style dry-run to confirm a moved
  kickoff sets `original_match_date` (client derives the "Delayed" badge), and a routine
  months-out correction does **not**.
- Regression: leaderboard/scoring untouched (coarse `status` unchanged except SUSP bugfix).

## Risks / edge cases

- **SUSP→live** means reconcile now skips suspended matches for date reconciliation (correct)
  and the live sync pulls events for them (fine). A match suspended and resumed >4 h later
  falls outside the live window — rare; note it.
- **AWD/WO** get labels but no scoring change; unlikely at a World Cup. Revisit only if it occurs.
- **Cancelled disappearing from Next Kickoff** is intended (decision 1) — the match is still on
  the results tab + detail with its badge, so info isn't lost.
- Ensure realtime UPDATE payloads carry `status_detail`/`original_match_date` (default replica
  identity sends full row) and the mobile patch mappers read them.

## Out of scope

- Push/email notifications on postponement (separate; ties into the notifier work).
- Scoring changes for AWD/WO.
- Web rendering (slice 8, tracked separately).
- **Admin manual `status_detail`** — the admin set-live/complete/reset paths write `status`
  directly (and `data_source='manual'` matches are skipped by sync). Letting an admin manually
  mark a match postponed/cancelled from the admin UI is a follow-up, not covered here.

## Open questions

- Confirm the three product-decision defaults above.
- Delay threshold for the "delayed" label (default: same-day or within 24 h of old kickoff)?
- Do we want the near-real-time live-window delay sync (optional in Slice 3) in v1?
