# Auto-save everywhere, submit nowhere

**Date:** 2026-08-29 · **Branch:** `table-mode/deadline-is-the-only-switch`

## The change in one line

Your picks save as you make them, and the deadline is the only switch. There is nothing to
submit.

This is the branch's existing premise applied to the remaining flows: Table mode already
works this way (`d3c0af9`, "dragging saves from the first drag, so the save button goes"),
and every league mode already treats submission as **derived from the picks** rather than
pressed.

**Disclosure gate:** *"Your picks save as you make them and lock at kickoff — there's nothing
to submit."* Passes. It removes a step rather than hiding one.

---

## What is actually true today (verified by reading, not assumed)

| Claim | Evidence |
| --- | --- |
| Every flow already auto-saves | 500 ms debounce + 60 s interval + `beforeunload` flush in `ProgressivePredictionsFlow`, `PredictionsFlow`, `BracketPickerFlow` |
| Auto-submit already exists | `lib/auto-submit.ts`, `/api/cron/auto-submit`, plus a lazy per-request fallback at `app/pools/[pool_id]/page.tsx:472` |
| The reveal gate is time-based | `lib/predictions/revealGate.ts` contains **zero** references to any submitted flag |
| **The league submit button is broken** | `PUT /predictions/round` returns 400 unless `prediction_mode === 'progressive'`; every league pool is `league_pickem` (`app/api/pools/create/route.ts:123`). It would fail twice — it also counts rows in `predictions`, and league picks live in `league_predictions` |
| The button's only real job is the lock | `isReadOnly = hasSubmitted \|\| …` in all three web flows |

So the button adds no persistence, no reveal, and — for league pools — no successful request.
What it adds is a lock the deadline should be applying, and a flag the scoring engine reads.

### The flag is the only load-bearing part

`has_submitted_predictions` has 197 references and is read by ~8 SQL functions in the scoring
engine (migrations 028, 030, 032, 034, 039, 046). It is what admits a World-Cup-shaped entry
to scoring. It cannot simply stop being written.

**Decision (Ryan, 2026-08-29): saving is submitting.** The save path sets the flag, so it keeps
meaning exactly what the engine already assumes — *this entry has picks worth scoring*. The
scoring engine stays closed. The alternative (derive from pick counts everywhere, as league
does) is the architecturally purer answer and is explicitly deferred: it reopens an audited
ledger for no user-visible gain.

---

## Design

### 1. Submission becomes a consequence of saving

`POST /api/pools/[pool_id]/predictions` sets `has_submitted_predictions = true` on the first
successful save, and `predictions_submitted_at` only if still null.

⚠ **Not for league pools.** `lib/league/write.ts` names `pool_entries.has_submitted_predictions`
as one of the two doors by which a league entry could enter World Cup scoring selectors. The
league branch of the save route must keep writing neither. Guard on `pool.league_season_id`,
which is the same discriminator the route already branches on at line 260.

⚠ **The save-after-submit rejection has to go first.** Line 238 refuses a save when the entry
has already submitted. Set the flag on save without removing that, and the *second* save of
every full-tournament entry is rejected. This is the one ordering that will silently break
everything if got wrong.

`predictions_submitted_at` is a rank tiebreaker. It becomes "time of first save" rather than
"time of pressing submit" — which rewards picking early rather than pressing a button early.
Recorded, not accidental.

### 2. Nothing locks except the deadline

Drop the submitted clause from every read-only computation:

- `PredictionsFlow.tsx:569` — `hasSubmitted || predictionsLocked || isPastDeadline`
- `PredictionsFlow.tsx:347` — the `saving || hasSubmitted` early return in `savePredictions`
- `BracketPickerFlow.tsx:243` — `isSubmitted || isLocked || isPastDeadline`
- `BracketPickerFlow.tsx:407` — the `isSubmitted` early return in its save
- `ProgressivePredictionsFlow.tsx:236` — `(isRoundSubmitted && !isMatchweekRound)`; the
  matchweek exemption stops being an exemption and becomes the rule
- `mobile/.../ProgressivePredictionWizard.tsx:99`, `mobile/.../BracketPickerWizard.tsx:152`

`predictions_locked` stays — that is the admin's lever, a different thing, and it keeps working.

### 2b. "Submitted" survives as a DERIVED state (Ryan, mid-build)

Removing the button does not remove the *state*. An entry whose picks are all in
and saved is still worth telling the member about — it just stops being something
they assert and becomes something the picks prove. This is exactly the rule
`deriveRoundSubmissions` (`lib/league/read.ts`) has always applied to a league
matchweek: `done >= total`.

So each flow computes it from its own picks, and it is deliberately **not**
`has_submitted_predictions` — that flag is true from the first save and would
call a one-pick entry finished:

| Flow | Derived from |
| --- | --- |
| `PredictionsFlow` | `isComplete` — every match predicted |
| `BracketPickerFlow` | `isBracketComplete` — groups + third place + every knockout tie |
| `ProgressivePredictionsFlow` | `isAllRoundPredicted` — every fixture in the round |
| mobile `PredictionsTab` | `completeEntryIds` — counted picks vs fixtures |
| mobile wizards | `pickedCount` / `completedStages` |

Crucially the complete state says the entry is **still editable**: "All 10 picked",
"complete and saved — editable until the deadline". Completion reports; it never locks.

### 3. The status bar is the whole feedback mechanism

`ProgressivePredictionsFlow` already renders `N / M matches predicted` + `Saved 14:32:07`.
That bar stays, absorbs the button's job, and gains a settled state once the round is
complete: **"All 10 picked"**.

⚠ It deliberately does NOT repeat the lock time. `RoundStatusCard` directly above already
carries a completion ring and a live "Locks in 3d 7h 59m" countdown, so a "locks Sat 12:30"
here — which is what the plan first proposed — would be the third telling of the same fact
on one screen.

The bar also stopped hiding itself once the round is complete. It carried `!isRoundSubmitted`,
which for a league pool meant it vanished on the member's last pick — the exact moment they
most want to be told the thing is saved. With the button gone this bar IS the confirmation,
so it has to survive completion.

Same treatment in the other two flows and on mobile (`ProgressBar` replaces `SubmitBar`).
No confirm modal anywhere — there is no irreversible act left to confirm.

---

## Edit sites

**Web (4 files)**
- `components/predictions/ProgressivePredictionsFlow.tsx` — delete the sticky submit block
  (696–710), the confirm modal (715–750), `submitRound`, `showSubmitModal`, `submitting`;
  relax `isReadOnly`; extend the status bar
- `components/predictions/PredictionsFlow.tsx` — same, plus the submitted banners at 589–601
  become a "locked at deadline" state
- `components/predictions/SummaryView.tsx` — drop `onSubmit` and "Submit All Predictions" (203)
- `components/predictions/BracketPickerFlow.tsx` — step 7 becomes "Review"; drop `handleSubmit`
  (645) and the modal

**API (2 routes)**
- `app/api/pools/[pool_id]/predictions/route.ts` — remove the 238 rejection; set the flag on
  save for non-league pools; leave the PUT handler in place but deprecated
- `app/api/pools/[pool_id]/predictions/round/route.ts` — deprecate; keep it answering for app
  builds older than the OTA. Its league 400 resolves itself once nothing calls it

**Mobile (3 files)**
- `ProgressivePredictionWizard.tsx`, `BracketPickerWizard.tsx` — drop the submit buttons and
  `SubmitDialog` unions; relax read-only
- `PredictionsTab.tsx` — the per-entry "Submitted / In Progress" chip becomes picks-based
- `mobile/lib/api.ts` — `submitRoundPredictions` / `submitBracketPicks` become unused

**Copy + notifications (3 files)**
- `app/pools/[pool_id]/HowToPlayTab.tsx:81` — currently "Submit your predictions before the
  deadline… drafts are auto-submitted". Rewrite: picks save themselves and lock at the deadline
- `lib/email/templates.ts` — `roundSubmittedTemplate` becomes dead. The two auto-submitted
  templates now describe the normal path, so reframe "your drafts were auto-submitted" as
  "your picks are locked in"
- `lib/push/deadline-warnings.ts:80` — filters on `!has_submitted_predictions`, which after
  this change means "has zero picks". Someone 3 fixtures into 10 would stop being reminded.
  Change to *hasn't picked every fixture* — `lib/league/notify.ts` already counts unfinished
  entries this way and is the model

---

## What deliberately does not change

- **The scoring engine.** No SQL touched. The flag keeps its meaning.
- **The reveal gate.** Already time-based; nothing to do.
- **The league write path.** Still writes neither forbidden column.
- **`predictions_locked`.** Admin lever, unrelated, stays.
- **The auto-submit sweep.** Stays as the safety net for entries whose last save failed. It
  will now almost never find work, which is the point.

---

## Risks

1. **Ordering.** The 238 rejection must come out in the same commit that starts writing the
   flag on save, or every second save 4xx's. Highest-consequence item here.
2. **Web ships before the mobile OTA.** During the gap an old app build can still submit and
   lock an entry that web now expects to stay editable. Mitigated by the read-only relaxation
   landing on web first — web ignores the flag for editability from the moment it deploys.
3. **No confirmation moment.** Members lose the "submitted!" toast and email. The continuous
   `Saved 14:32` plus the settled "All 10 picked · locks Sat 12:30" is the replacement, and the
   deadline-warning push still chases people who haven't picked. Worth watching, not blocking.
4. **`save_predictions_batch` is production-only** — no migration file defines it. Confirm it
   does not already write the flag before adding a second writer (see the two-XP-writers
   incident). Read `prosrc` before assuming.

---

## Verification

**Done:**
- `npm run test` — 946 passed, 6 skipped, 66 files
- `npx tsc --noEmit` web — clean (only the 3 known `FormData` errors from the
  corrupted local `node_modules`, in a file this change never touches)
- `npx tsc --noEmit` mobile — 4 errors, all pre-existing GiftedChat/banter typings
- `eslint` on all 19 changed files — no new findings; every remaining warning is
  in the baseline
- `npm run build` fails locally on the same `FormData` issue only

**Still owed — nothing here has been exercised in a browser:**
- Seeded PL pick'em UX pool: pick all 10 → bar reads "All 10 picked" → reload →
  picks persist → change one → still saves → **no submit button anywhere**
- A full-tournament pool: save twice in a row, confirm the second is not rejected
  (the ordering risk above, and the one thing most worth eyeballing)
- Confirm a league entry still has `has_submitted_predictions IS NULL` after picking
- `npx tsx scripts/verify-read-paths.ts`

## Deferred, deliberately

- **`predictionsSubmittedTemplate` / `roundSubmittedTemplate` are now unreachable
  from this repo.** Left in place rather than deleted, because the two deprecated
  PUT routes still answer old clients. Delete both with the routes.
- **`autoSubmitDraftEntries` will now almost never find work** — it filters
  `has_submitted_predictions = false`, which the save path sets. That is the
  intended end state (it becomes a true safety net for entries whose last save
  failed), but it means the "your drafts were auto-submitted" email effectively
  stops sending. Members get no email at the deadline now; the save indicator and
  the deadline-warning push carry it instead.
- **Mobile bracket picker still reads the flag** for its entry chip (its picks are
  in `bracket_picker_*`, not `predictions`), so `PredictionsTab` skips the
  completeness count for that mode. Noted in the code.
