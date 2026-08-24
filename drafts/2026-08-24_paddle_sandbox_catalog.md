# Paddle sandbox catalog — Phase 3a Step 0

Created 2026-08-24 in the **sandbox** account (`sandbox-mcp.paddle.com`, `pdl_sdbx_` key in
`.mcp.json`). Nothing here exists in live. No application code was written.

## The IDs

| Tier | Product ID | Price ID | Amount | Cadence |
|---|---|---|---|---|
| `plus` | `pro_01m0tjkgdr87c77xz0szvgjwpz` | `pri_01m0tjkgjdmk33fa8bbmktvt3b` | $19.00 | One season |
| `max` | `pro_01m0tjkgpmey8c5r0vteev233b` | `pri_01m0tjkgrncz5tmtea1w6wsj7h` | $49.00 | One season |
| `ultra` | `pro_01m0tjkgx1xx1gway5kg5294vs` | `pri_01m0tjkgyy8gpt6c6x7ncw3jc8` | $500.00 | One tournament |

Free is not a Paddle product — it is the absence of a purchase (`pools.tier = 'free'`).

## Choices baked into the catalog

- **One-time, not recurring.** `billing_cycle` omitted ⇒ `null`. Matches Principle 2 (event-based
  for admins). Verified `recurring: false` on all three.
- **Quantity locked to 1–1.** Default is 1–100; a pool buys exactly one tier, so a checkout can
  never come back with quantity 3. Removes a whole class of webhook edge case.
- **`custom_data.tier` on BOTH product and price.** The webhook maps a purchase to a tier by
  reading `custom_data.tier`, *not* by matching a hardcoded price ID. Price IDs change when
  pricing changes; the tier key does not. Live IDs will differ from these — do not hardcode.
- **`tax_category: 'saas'`** — ⚠️ chosen as the best fit for cloud-hosted software access, but
  **not confirmed with Paddle**. It affects tax treatment and must be enabled on the account.
  Confirm during the RM-08 approval conversation; trivially changeable in sandbox.

## Decision recorded this session

`entry_fee` is **not** reused for platform charges, reversing the line in `MONETIZATION.md`
Phase 3a. `pools.entry_fee` + `pool_members.entry_fee_paid` is the members' off-platform pot the
admin tracks by hand. Platform revenue goes in a new `pool_purchases` table + `pools.tier`.

**Why:** RM-08 turns on being able to tell Paddle "player money never touches us." Merging our
revenue into the same columns as the players' pot destroys that answer. Both `MONETIZATION.md`
and `MONETIZATION.html` were amended.

## Step 2 — DONE (2026-08-24), not applied, not committed

| File | What |
|---|---|
| `lib/paddle/verifySignature.ts` | HMAC-SHA256 verification, constant-time compare |
| `lib/paddle/transactionCompleted.ts` | Narrow types + pure payload extraction, upgrade-only tier resolution |
| `app/api/paddle/webhook/route.ts` | The route. `runtime = 'nodejs'` (needs node:crypto) |
| `lib/paddle/__tests__/*.test.ts` | 45 tests, all passing |

Signature contract read from Paddle's live docs 2026-08-24, not from memory:
header `Paddle-Signature`, format `ts=…;h1=…`, HMAC-SHA256 over `${ts}:${rawBody}`,
key = the destination's `pdl_ntfset_` secret, **raw body must not be reformatted**.

Deliberate deviations, both explained in the source:
- **Tolerance is 300s, not Paddle's SDK default of 5s.** 5s is inside normal clock
  skew, and the docs do not say whether a retry is re-signed with a fresh `ts` —
  if not, a 5s window rejects every retry. Replay is already harmless because of
  the UNIQUE constraint, so the tight window buys nothing.
- **Hand-rolled, no `@paddle/paddle-node-sdk`.** One HMAC does not justify a
  dependency and its version drift; narrow local types replace the SDK's.

No `paddle_webhook_events` table, reversing what this note first said: Paddle's own
notification log already retains 90 days and is queryable (`client.notifications.list`).
Duplicating it locally is a second source of truth to keep in sync.

⚠ A test caught a real bug before it shipped: `Number('19.00')` is `19` and
`Number.isInteger(19)` is `true`, so validating the parsed number instead of the
string form would have booked **19 cents** for a $19 tier. Amounts are now
validated as digit-only strings.

## Env vars this route needs

| Var | Value |
|---|---|
| `PADDLE_WEBHOOK_SECRET` | the `pdl_ntfset_` secret from the notification destination |
| `PADDLE_ENVIRONMENT` | `sandbox` or `live` — no default, labels every ledger row |

`SUPABASE_SERVICE_ROLE_KEY` is already set and is required: the tier trigger
silently reverts a write from any other role.

## Step 3 — DONE (2026-08-24), 🔴 BLOCKED on one dashboard setting

| File | What |
|---|---|
| `lib/paddle/tiers.ts` | Tier catalog; price IDs from env, never hardcoded |
| `lib/paddle/api.ts` | Server-side Paddle REST client (fetch, no SDK) |
| `app/api/pools/[pool_id]/upgrade/route.ts` | Authorized checkout creation |
| `app/pools/[pool_id]/upgrade/page.tsx` + `UpgradeOptions.tsx` | Admin-facing tier picker |

66 Paddle tests pass; full suite 508 pass; tsc and eslint clean.

### 🔴 THE BLOCKER

`transactions.create` fails on the sandbox account with:

> Cannot create a transaction or open a checkout as no default payment link has
> been set for this account. Set in the Paddle dashboard, then try again.

Verified live 2026-08-24. **There is no API for this** — `checkoutDomains` is
read-only listing, with no set-default operation. Dashboard only, so Ryan must do it.

`sportpool.io` is ALREADY an approved checkout domain
(`chedom_01m0rvxvnvc0akf84bphndv66z`, status `approved`), so only the default
payment link itself is missing — e.g. `https://sportpool.io/checkout`.

This blocks **both** designs equally: the Paddle.js overlay hits the same error.
Nothing downstream can be exercised end-to-end until it is set.

### Design change from the plan

The plan said "Paddle.js overlay". Implemented as **server-created transaction +
hosted-checkout redirect**, because the overlay lets the BROWSER supply
`customData` — i.e. the browser decides which pool gets credited. Now
`/api/pools/:id/upgrade` checks the caller is an admin of that specific pool,
that it is not archived, and that the tier is a genuine upgrade, and only then
stamps `pool_id` server-side.

The route returns **both** `checkout_url` and `transaction_id`, so moving to an
overlay later is `Paddle.Checkout.open({ transactionId })` in one client
component — no server change at all.

Also caught by the checks: `PADDLE_ENVIRONMENT` is cross-checked against the API
key prefix (`pdl_sdbx_` / `pdl_live_`) and refuses to run on a mismatch, so a
live key can never write ledger rows labelled "sandbox".

## Step 4 — DONE (2026-08-24), not applied, not committed

| File | What |
|---|---|
| `lib/migrations/075_free_tier_caps.sql` | Grandfather column, 2 cap functions, 2 BEFORE INSERT triggers |
| `lib/paddle/tiers.ts` | `memberCap` / `entryCap` on each offer (display only) |
| `lib/paddle/__tests__/tierLimits.test.ts` | Drift guard: TS caps vs the SQL, 11 tests |
| `app/api/pools/join/route.ts` | `SP010` → 409 "pool is full" instead of a 500 |
| `.../entries/route.ts` | `SP011` → 409 "entry cap reached" |
| `.../upgrade/UpgradeOptions.tsx` | Cards now show the caps |

Caps: free 10 members / 1 entry · plus 30 / 3 · max and ultra unlimited.

### 🔴 The grandfather clause is the whole migration

067 gives every existing pool `tier = 'free'`. A naive 10-member cap would break
every pool that already has more — and the WC regression says office pools
CLUSTER at 10–18 members, so that is most of them, including admins who already
paid $19/$49 under the old manual arrangement.

`pools.tier_enforced_from`: NULL = never capped (every pool that exists today),
timestamp = capped (every pool created from now on). The column is added with NO
default so existing rows land on NULL, and the default is set in a second
statement. **That ordering IS the clause** — a single
`ADD COLUMN … DEFAULT now()` caps the entire customer base on apply. There is a
test asserting the migration still has it that way.

### Decisions

- **Triggers, not API checks.** Joins go through `/api/pools/join` today and
  mobile calls that same route, but RLS policies on `pool_members` live in the
  base schema where we cannot see them, and a trigger covers paths nobody has
  written yet.
- **`create_pool_entry` (005) is NOT modified.** CREATE OR REPLACE against a
  function whose live definition may have drifted silently overwrites the drift —
  the 055 lesson. A separate trigger touches nothing that already works.
- **Custom SQLSTATEs `SP010` / `SP011`** so the API branches on a code, not on
  message text.
- **Unlimited is NULL, not a big number**, so it can never be silently exceeded.
- **An unrecognised tier is uncapped**, so a typo cannot lock people out of a
  pool they paid for.

⚠ **Plus member cap is still an open question** (30 vs 20 — MONETIZATION.md open
question 2). Shipped at 30, the published number. Changing it means editing
`pool_tier_member_cap()` and the TS mirror; the drift test fails until both move.

⚠ **Separate pre-existing bug, NOT fixed:** `pools.max_participants` — the
admin's own member limit — is stored, displayed and editable but enforced
NOWHERE. An admin can set "max 20" and 50 people still join. Different limit from
the tier ceiling (theirs, not ours); deserves its own fix.

## Next (not started)

6. **Link the upgrade page** from the pool UI. Nothing routes to
   `/pools/:id/upgrade` yet — the natural trigger is catching `SP010`/`SP011` in
   the UI and offering the upgrade at the moment someone hits the cap.
7. **Test** — sandbox test cards, plus `client.simulations.create` to fire events.

### Order of operations before ANY of this works

1. Set the default payment link in the Paddle sandbox dashboard 🔴
2. Apply migration 067 — until then the upgrade route and page select a `pools.tier`
   column that does not exist, and PostgREST's 400 is discarded rather than raised
3. Deploy to the `Development` branch preview (webhooks need a public URL)
4. Create the notification destination against that URL, set the two env vars

## Env vars

| Var | Notes |
|---|---|
| `PADDLE_API_KEY` | server-only, never `NEXT_PUBLIC_` |
| `PADDLE_ENVIRONMENT` | `sandbox` \| `live` — cross-checked against the key prefix |
| `PADDLE_WEBHOOK_SECRET` | `pdl_ntfset_…` from the notification destination |
| `PADDLE_PRICE_ID_PLUS` | `pri_01m0tjkgjdmk33fa8bbmktvt3b` |
| `PADDLE_PRICE_ID_MAX` | `pri_01m0tjkgrncz5tmtea1w6wsj7h` |
| `PADDLE_PRICE_ID_ULTRA` | `pri_01m0tjkgyy8gpt6c6x7ncw3jc8` |

## Undo

Products/prices cannot be deleted, only archived:
`client.products.update(id, { status: 'archived' })` and the same for each price.
