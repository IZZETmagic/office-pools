# Post-tournament feedback surveys — send runbook

**Status: 🟡 READY TO SEND, pending a production deploy.** The two Tally forms are
published and live, the segment truncation bug that would have silenced 96% of the
player audience is fixed and verified, and pre-flight passes. Nothing has been emailed.

**Blocked on one thing:** the segment fix lives in this working tree only. The super-admin
Templates tab runs against production, so **master must be deployed before either send** —
otherwise the send resolves the old truncated audience (198 admins / 146 players) and burns
its idempotency key doing it.

---

## What was actually wrong (found 2026-07-21)

The item was recorded as "fully built, only the ops send remains." Three things say otherwise.

**1. Every segment silently truncated at 1,000 rows.** PostgREST caps an unbounded
`.select()` at `db.max_rows` (1,000 here) and returns a short array with **no error**.
`lib/email/segments.ts` never paged, and each segment intersects two or three of these
lists in memory, so the truncation compounded:

| Segment | Would have received | Should receive |
|---|---|---|
| `pool_admins` | 198 | 477 |
| `past_predictors` | **146** | 3,958 |

The player case was capped twice over — `users` at 1,000 of 4,841 *and* `pool_entries` at
1,000 of 4,263 submitted. A dry run would have reported "146 recipients" as if that were
the audience.

**2. Both Tally forms were still DRAFT.** `tally.so/r/Y59YEN` and `/r/RGjJKK` both returned
**404**. Every CTA in both emails was a dead link.

**3. The send route had no `maxDuration`.** ~4.1k emails is ~41 sequential Resend batch
calls, and the idempotency key is written to `sent_announcements` *before* the first send —
a timeout mid-run leaves a partial send that can't be retried (409 on every attempt).

---

## What changed

- `lib/email/segments.ts` — added a paged `fetchAll()` helper and routed **every** segment
  through it (all 15 had the same defect, not just the two used here). Shared helpers
  (`allUsers`, `adminUserIds`, `predictorUserIds`, …) replace the copy-pasted fetches.
  `bracket_fix_affected` is deliberately left on the old path and commented as historical —
  paging it would walk six figures of `predictions` rows.
- New segment `past_predictors_non_admin` — submitted predictions **and** doesn't run a
  pool. The player survey now targets this, so the 306 people who are both get the (richer)
  admin survey only and nobody receives two emails.
- `app/api/admin/send-template/route.ts` — `maxDuration = 300`; 600 ms pacing between
  batches (Resend's default limit is 2 req/s); the response now reports the fallback path's
  real `sentCount` instead of assuming a whole batch landed, and returns an `unsent[]` list
  of addresses when a batch fails.
- Both Tally forms published. The final "Anything else?" box on each was marked
  **required** despite its placeholder reading "Optional." — now genuinely optional, which
  also makes the "six questions" / "five questions" intro copy accurate.
- `scripts/preflight-feedback-survey.ts` — read-only pre-flight (below).

**By decision, no Resend topic is attached** — maximum reach, so per-category email
opt-outs are not honored for these two sends. The only opt-out in the footer is the
static "Unsubscribe" link to `/profile?tab=settings`. Worth a glance at the Resend
complaint rate after the player send; the privacy policy promises one-click unsubscribe on
broadcast email, and this send doesn't provide it.

---

## Send procedure

### 1. Deploy

Master must be live on Vercel with the segment fix. Confirm the deploy finished before
step 2 — this is the whole ballgame.

### 2. Pre-flight (run against production, sends nothing)

```bash
npx tsx scripts/preflight-feedback-survey.ts
```

Expected, as of 2026-07-21:

```
  pool_admins               : 477
  past_predictors_non_admin : 3652
  total emails             : 4129
  ✓ no recipient appears in both segments
  ✓ Pool admin survey is live (200)
  ✓ Player survey is live (200)
PRE-FLIGHT PASSED — safe to send.
```

**If any check fails, stop.** A count near 198/146 or landing on an exact multiple of 1,000
means the deploy didn't take. A 404 on a survey link means a form got unpublished.

### 3. Send — admins first

Super admin → **Templates** → `Pool Admin Feedback Survey`:

1. **Dry run** first. It must report **477** recipients. Read the rendered preview and
   click the CTA — it should open the live Tally form.
2. Send. Response should read `Sent 477 of 477 emails`.

### 4. Send — players

Same tab, `Player Feedback Survey`. Dry run must report **3,652**. Send; expect
`Sent 3652 of 3652`. This one runs ~40 batches with pacing, so give it a minute.

Order matters only in that admins should hear from you first; there's no overlap to stagger
around any more.

---

## If a send goes wrong

**Response shows fewer sent than total, with `unsent[]`.** Those addresses got nothing.
Don't re-fire the template (the idempotency key is spent and it would re-send to everyone
who *did* get it). Use the **custom** template with `recipient_mode: 'users'` targeted at
those addresses.

**The request times out or 500s.** The idempotency key is already recorded, so a retry
returns 409. Check what actually went out in Resend first, then clear the key to retry:

```sql
-- inspect before deleting; the key looks like template-player_feedback_survey-<epoch_ms>
select * from sent_announcements order by created_at desc limit 5;
delete from sent_announcements where idempotency_key = '<the key>';
```

Re-running after a partial send **will** double-email whoever already received it. Prefer
the targeted follow-up above unless almost nothing went out.

---

## After the sends

- Responses land in Tally: [admin form](https://tally.so/forms/Y59YEN/edit) ·
  [player form](https://tally.so/forms/RGjJKK/edit). Neither form carries a per-respondent
  identifier, so responses are anonymous — deliberate, for candor.
- The multi-sport interest checkbox is the strategic payload: it feeds prioritization for
  the data-model / pool-template / sports-data work, and the Premier League ingestion
  already drafted in `lib/integrations/apiFootball/importLeagueSeason.ts`.
- The upvote-board decision stays deferred until responses are in — yearly-burst usage
  means no board is needed; a steady drip would justify one.
