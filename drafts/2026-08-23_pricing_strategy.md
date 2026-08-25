# SportPool — Pricing Strategy

**Date:** 2026-08-23
**Status:** Draft for Ryan. Three decisions inside are **his to make** and are marked 🔴; everything
else is re-costed against measured data and ready to act on.
**Consolidates:** `MONETIZATION.md` (v1.0, May 2026) · `SPORTPOOL_VISION.md` §6.5 / §9.1 / §9.2 /
§10 · `memory/project_backlog_monetization.md`

---

## 0. Why this document exists

Three reasons, in order of importance.

1. **The May plan was never re-costed, and §10 says it must be.** `SPORTPOOL_VISION.md` §6.5
   (2026-07-26) ruled that **every user should be monetisable, not just admins**, and demoted the May
   tier table to *"one lane within it, not the whole plan."* §10 lists *"the monetisation plan needs
   re-costing"* as open. That re-costing is §5 of this document.

2. **The plan was costed against 15 pools. We have 623.** The May regression excluded test and
   inactive pools and modelled $280 of revenue across 15 of them. The World Cup post-mortem
   (2026-08-08) has the full distribution. Re-run against it, the answer changes materially — and it
   changes in the *opposite* direction to what the plan assumed. See §5.

3. **It was impossible to find.** `MONETIZATION.md` was committed once, on 2026-06-27, to a branch
   (`scale/pool-caching-phase1`) that was never merged. `master` has since moved 416 commits past it.
   It has been invisible from the working tree for two months. It is now restored to the repo root.

> **What this document is not.** It does not re-open the no-gambling rule, the no-funds rule, or the
> five gates. Those are settled in `SPORTPOOL_VISION.md` §7 and constrain everything below.

---

## 1. The constraints everything must satisfy

Not negotiable. Any pricing idea that fails one of these is dead on arrival, not a trade-off.

| # | Constraint | Source |
|---|---|---|
| 1 | **We never touch prize money.** No rake, no escrow, no percentage of a pool. Revenue is a flat service charge for software. | Vision §7.2; entry-fee assessment 2026-07-25 |
| 2 | **No randomness we invented.** Deterministic purchases only — you buy the thing you chose, never a chance at it. No loot boxes, no crates, no spin-to-unlock. | Vision §6.6, §9.4 |
| 3 | **Every mechanic passes the five gates** at design time: disclosure · affect · symmetry · substitution · variance provenance. | Programme, Decision 8 |
| 4 | **The commissioner is the primary customer.** Losing one loses ~7.6 players. | Vision §4 |
| 5 | **No bad feelings.** Nobody finishes feeling cheated or nagged. | Vision §1 |

Constraint 1 is doing more work than it appears to. The entry-fee assessment calls the no-funds
posture *"the single biggest risk-reducer available"* and warns that **any monetisation taking a
percentage of pools "would blow this up entirely."** A flat platform fee is compatible with it. A
percentage of anything is not — and that is a legal boundary, not a preference.

---

## 2. What we sell — two independent ladders

The May plan's core structure is sound and survives re-costing. Keep it.

- **The admin ladder** decides *what features exist in a pool*. One-time, per season or tournament.
  No subscription, no auto-renewal.
- **The player ladder** decides *how a player experiences whatever exists*. Continuous subscription,
  tournament-agnostic, works in every pool including free ones.

They layer cleanly and neither replaces the other. A Pool Pro subscriber carries their experience
into every pool they join, whatever tier the admin bought.

### 2.1 The admin ladder

| | **Free** | **Pool Plus** | **Pool Max** | **Pool Ultra** |
|---|---|---|---|---|
| Price | $0 | $19 / season | $49 / season | $500 / tournament |
| Members | 10 | 30 | Unlimited | Unlimited |
| Entries per person | 1 | 3 | Unlimited | Unlimited |
| Modes | 1 default | All | All | All |
| Custom scoring | — | ✅ | ✅ | ✅ |
| Pool branding | Generic | ✅ | ✅ | ✅ |
| Landing page / TV board / broadcast / CSV | — | — | ✅ | ✅ |
| Venue pack *(profile, directory, marketing, ledger, staff)* | — | — | — | ✅ |

**Changed from the May plan:** the *Form tab (XP)* and *Banter* rows are removed from the paywall
entirely. Both are now free at every tier. §6 explains why, with the data that forces it.

### 2.2 The player ladder

See §3. This is the "subscription for everyone" and it is the half of the plan that most needs work.

---

## 3. Pool Pro — the subscription for everyone

The plan's Vector 2, developed. This is the vehicle for §6.5's *"every user should be monetisable."*

### 3.1 Why a subscription works here when it doesn't for admins

The May plan rejected an admin subscription and was right to: hosting a pool is an **event-shaped**
act. You set one up, it runs, it ends. Billing monthly for a discrete event invites resentment.

Playing is **continuous**. Measured support for that:

- Engaged players sit in 2–5 pools at once — 247 users joined more than one pool during a single
  competition, with no cross-competition catalogue to make that easy.
- Competitions overlap across the calendar (EPL Aug–May, NFL Sep–Feb, NBA Oct–Jun). There is no
  dormant window once multi-sport lands.
- **2,148 users were last seen after the final whistle** and 110 were still active three weeks later.
  That is a standing audience, not an event spike.

### 3.2 Tiers

| | Price | What it includes |
|---|---|---|
| **Free player** | $0 | The full game. Every prediction, every leaderboard, banter, XP, badges. |
| **Pool Pro** | **$4.99/mo** or **$39/yr** | Advanced personal stats (form curves, head-to-head, accuracy trend), theme picker, exclusive Pro badge variants, "Pro" mark on profile and leaderboard, animated rank-up celebrations |
| **Pool Pro Plus** | **$7.99/mo** or **$59/yr** | All Pool Pro, plus one chosen cosmetic per month, year-end "Wrapped" recap, custom badge designer, priority support, early access |

### 3.3 Three changes to the May specification

**a. Notification controls come out of the paid tier.** The plan lists *"priority push category
controls"* as a Pool Pro feature. Charging for the ability to manage notifications we send fails the
disclosure gate on sight — *"pay us to control the messages we send you"* is not a sentence that
survives a tooltip. Notification preferences are free, for everyone, permanently.

**b. The monthly cosmetic is chosen, never rolled.** The plan says *"1 cosmetic item per month
(rotating curated selection)."* Read strictly that is fine — curated is not random — but it is one
product decision away from a loot box. Written explicitly: the subscriber **picks** their item from
the month's set, and the set is visible before they subscribe. Constraint 2.

**c. Gameplay stays out, and this is load-bearing.** The plan already excludes multi-entry from Pool
Pro. Extend that to a rule: **Pool Pro never changes what a player can do in a pool, only what they
see about themselves and how their profile looks.** The moment a subscription buys competitive
advantage, the product acquires a pay-to-win problem in a game whose entire purpose is "no bad
feelings" among friends.

### 3.4 Where its value actually sits

The plan's own layering analysis found that **~80% of Pool Pro's value works in any pool, including
free ones** — which means free-pool players get the biggest lift from subscribing. That is the right
instinct and it becomes *more* true under §6, where banter and XP leave the paywall: with the free
tier genuinely complete, Pool Pro has to sell depth and identity rather than access.

That is a harder sell, and §5.2 prices it accordingly.

---

## 4. What the World Cup actually measured

Source: `drafts/2026-08-08_world_cup_2026_post_mortem_analytics.md`. All figures measured, not modelled.

| | |
|---|---:|
| Registered users | **4,827** |
| Pools created | **623** |
| Commissioners | **477** (9.9% of users) |
| Pool memberships | **4,803** |
| Entries submitted | 3,944 (81.7%) |
| Submitted *manually* | 2,062 (**42.7%**) |
| Posted any banter | 1,120 (23.2%) |
| **Typed a real message** | **327 (6.8%)** |
| Last seen after the final | 2,148 (44.5%) |
| Active in all four phases | 282 (5.8%) |

### Pool size distribution — the table the pricing hangs on

| Size | Pools | Members | Human msgs/member | % who ever type | % submitted |
|---|---:|---:|---:|---:|---:|
| 0 (empty) | 72 | 0 | — | — | — |
| 1 (solo) | 247 | 247 | 0.02 | — | 29.6% |
| 2–4 | 111 | 288 | 0.42 | **15.3%** | 69.1% |
| **5–9** | **58** | **420** | **1.24** | **14.5%** | 84.3% |
| 10–19 | 70 | 1,010 | 0.54 | 9.5% | 92.4% |
| 20–49 | 49 | 1,483 | 0.26 | 7.6% | 93.5% |
| 50+ | 16 | 1,355 | 0.07 | 2.4% | 96.2% |

Median pool = **1 member**. p90 = 20. Largest = 192. **51.2% of pools had one member or none.**

Two facts from this table drive everything below:

1. **Submission rate rises with size; conversation collapses with it.** 1.24 human messages per
   member at 5–9 members, 0.07 at 50+. An 18× drop.
2. **The two most conversational bands (2–4 and 5–9) sit entirely inside the free tier.**

---

## 5. The re-costing

### 5.1 Admin tiers — the plan under-counted, and it under-counted the good half

The May plan assumed a **1.6% paying-admin rate** and flagged its own risk RM-04: *"the consumer admin
tier alone is structurally low-revenue."* That conclusion came from a 15-pool sample.

Queried directly against production on 2026-08-24 — **exact counts, not estimates**:

| | Pools | Distinct admins |
|---|---:|---:|
| Total | **625** | **477** |
| Over the free cap (>10 members) | **125** (20.0%) | **118** |
| Over 20 members | 61 | 58 |
| Over 30 members | 38 | 36 |

> Production now shows 625 pools against the post-mortem's 623 — two pools created since 2026-08-08.
> The admin count (477) matches the post-mortem exactly.

**Revenue, one tournament, at 100% conversion, with Plus capped at 30:**

```
87 pools (11-30) x $19 = $1,653      (Plus)
38 pools (31+)   x $49 = $1,862      (Max)
                         ------
                         $3,515      $29.79 per paying admin
```

**118 of 477 commissioners — 24.7% — ran at least one pool that exceeds the free cap.** As a share of
users that is **2.44%**, against the plan's assumed 1.6%.

**Scaled to the plan's 50K-user comparison point:**

| | May plan | Re-costed (measured) |
|---|---:|---:|
| Paying-admin rate | 1.6% | **2.44%** |
| Avg price per paying admin | $28 | $29.79 |
| Revenue / year (4 tournaments) | $89,400 | **~$145,600** |

**RM-04 is weaker than the plan believed.** The admin ladder is worth roughly **1.63×** what was
credited to it. That matters strategically, because RM-04 is the risk that motivated the pivot to
player monetisation in the first place.

#### The Plus cap is worth £-for-£ more than the Plus price

Open question 2 in the May plan asked whether to tighten Plus from 30 members to 20. The exact
distribution answers it, and the answer is worth more than it looks:

| Plus cap | Plus pools | Max pools | Revenue / tournament | At 50K users |
|---|---:|---:|---:|---:|
| **30** *(as planned)* | 87 | 38 | $3,515 | $145,600 / yr |
| **20** *(recommended)* | 64 | 61 | **$4,205** | **$174,200 / yr** |

Tightening the cap to 20 lifts revenue **+19.6%** and takes the multiple against the May plan from
1.63× to **1.95×** — without changing a single price. The reason is visible in the data: 23 pools sit
in the 21–30 band, and the band as a whole averages 30.3 members, so a 30-cap is priced for pools that
are really Max-shaped.

⚠️ **Two caveats that cut the other way.** The 100% conversion figure assumes every capped admin pays
rather than trimming the pool, splitting it, or walking. And "4 tournaments per year" assumes every
competition monetises like a World Cup, which is unproven — the Premier League is a 38-week season
with no single kickoff moment, and §11.1 of the post-mortem says plainly that nothing in the World Cup
data tells us whether that breaks the growth model or fixes it. At 50% conversion the yearly figure is
~$72,800.

### 5.1b Backtest — what the World Cup would actually have earned

Every figure below is the pricing model applied to the **real 623 World Cup pools**, queried from
production on 2026-08-24. Not a sample, not a model — the actual tournament, re-run with a price list
attached.

**Three gates, not one.** §5.1 counted only the member cap. The May plan also gates **entries per
user** (Free = 1) and **mode** — for the World Cup the free default is `full_tournament`, so
*progressive* and *bracket_picker* both require Plus. Each pool is charged the lowest tier that
satisfies all three.

| | Free | Plus ($19) | Max ($49) | **Revenue** |
|---|---:|---:|---:|---:|
| **All three gates enforced** | 187 | 395 | 41 | **$9,514** |
| **Mode gate removed** *(admins pick the free mode)* | 472 | 110 | 41 | **$4,099** |

**The mode gate is 57% of the modelled revenue and the most fragile assumption in the plan.** It moves
285 pools from Free to Plus on its own. But if *progressive* costs $19 and *full_tournament* is free,
a large share of those 281 progressive admins simply choose the free mode — they are picking a format,
not buying a feature. Treat $9,514 as a ceiling that assumes behaviour does not adapt to price. It
would.

#### Then subtract the pools that were never going to pay

**46% of the all-gates revenue — $4,373 — comes from pools that never became a contest** (fewer than
two submitted entries). A solo pool running progressive mode is not going to pay $19 to stay solo; it
will switch mode or leave. Charging only genuine contests:

| Scenario | All pools | **Real contests only** |
|---|---:|---:|
| All three gates | $9,514 | **$5,141** |
| Mode gate removed | $4,099 | **$3,773** |

**The defensible band is $3,773 – $5,141 for the entire World Cup**, and even that assumes *everyone*
who hits a gate pays. At 50% conversion it is **$1,900 – $2,600**.

#### Full stack, applied to the World Cup

| Stream | Backtested | Basis |
|---|---:|---|
| Admin tiers | **$3,800 – $5,100** | Measured, real contests, 100% conversion |
| Pool Ultra | **$0** | **Measured — zero venue customers existed** |
| Cosmetics | ~$400 | 3% of 4,489 players × $3 — plan's assumption, untested |
| Pool Pro | ~$900 – $5,300 | 1–3% of players over a 2.5-month window |
| Merchandise | ~$300 | Not built during the World Cup |
| **Total (gross)** | **~$3,200 – $11,100** | |
| **Total (net of Paddle)** | **~$3,000 – $10,300** | ~7% blended — see §5.1c |

#### The finding that matters

The May plan's own regression put World Cup revenue at **$280** across 15 pools. Against all 623, the
admin ladder alone is **$3,773 – $5,141 — 13× to 18× higher.** The regression sampled roughly 6% of
the tournament's real contests and drew a structural conclusion from it. That conclusion is RM-04, and
RM-04 is what motivated the pivot away from admin monetisation.

**But the honest headline is the absolute number, not the multiple.** The biggest tournament in the
sport, 4,827 users, 623 pools, run end to end — and the model yields **somewhere between three and
eleven thousand dollars.** That is not a business; it is a hosting offset. It is also exactly what
Vision §6.5 already says — *"still in the self-funding phase"* — now with a number attached rather
than a posture.

Two consequences:

1. **Do not price for revenue at this scale; price for signal.** The purpose of shipping phase 1 is to
   learn conversion, not to earn $4,000. Design it to produce a clean conversion number.
2. **Growth, not pricing, is the lever.** Every model in this document scales linearly with users. At
   4,827 users no price list rescues the economics; at 50K the same list yields ~$214K–246K. The
   pricing work is small next to the acquisition work, and should be sized accordingly.

### 5.1c Paddle fees — what actually lands in the bank

Paddle is the payment service being onboarded, and it is a **Merchant of Record**: it becomes the
seller, handles global sales tax and VAT, and pays out net. Rates verified against Paddle's published
pricing on 2026-08-24.

| Fee | Amount |
|---|---|
| **Transaction** | **5% + $0.50** per checkout |
| Payout | Free when payout currency matches the bank's country; **$15 SWIFT** if international |
| Currency conversion | **up to 1.5%** margin if payout currency ≠ balance currency |
| Chargeback | **$15** card, **$20** PayPal |
| **Refunds** | **Paddle retains its fee.** Refund the customer, the 5% + 50¢ does not come back |
| Products **under $10** | **Not standard-rate — requires custom pricing** |

#### The fixed 50¢ is the whole story

A flat percentage would be neutral across the price list. A flat **fee** is not — it punishes small
tickets, and our price list is full of them:

| Product | Price | Paddle fee | Net | **Effective rate** |
|---|---:|---:|---:|---:|
| Pool Ultra | $500.00 | $25.50 | $474.50 | 5.1% |
| Pro Plus annual | $59.00 | $3.45 | $55.55 | 5.8% |
| Pool Max | $49.00 | $2.95 | $46.05 | 6.0% |
| Pool Pro annual | $39.00 | $2.45 | $36.55 | 6.3% |
| Pool Plus | $19.00 | $1.45 | $17.55 | **7.6%** |
| Pro Plus **monthly** | $7.99 | $0.90 | $7.09 | **11.3%** |
| Pool Pro **monthly** | $4.99 | $0.75 | $4.24 | **15.0%** |
| Cosmetic | $1.99 | $0.60 | $1.39 | **30.1%** |

Three consequences, in order of how much money they move:

**a. Sell Pool Pro annually, not monthly.** A monthly subscriber pays $59.88 a year against the annual
plan's $39 — 1.54× the gross — but generates **3.67× the fees**, because the 50¢ lands twelve times
instead of once. Monthly is still more profitable per subscriber-year ($50.89 net vs $36.55), so this
is not an argument against offering it; it is an argument for **pricing the annual discount to be
genuinely attractive and defaulting to it**, and for never letting monthly become the headline price.

**b. Cosmetics do not work at $1.99 on standard rates.** 30% to fees, and Paddle's own pricing page
says products **under $10 need custom pricing** — so the entire $1.99–4.99 cosmetics range falls
outside the standard agreement anyway. Before phase 2 is scoped: either negotiate a small-ticket rate
with Paddle, or **bundle cosmetics into packs above $10**, or route them through mobile IAP where
Apple and Google take 15–30% but there is no fixed component. This is a live design constraint, not a
rounding error.

**c. Every refund costs us the fee.** Paddle keeps its 5% + 50¢ on refunded transactions. The 14-day
policy on the live page is the right commitment and should stay — but it is not free. At a 5% refund
rate on World Cup volumes it is only ~$15, so this is a footnote today and a real line item at scale.

#### The backtest, net of Paddle

| Scenario | Gross | Paddle | **Net** | Rate |
|---|---:|---:|---:|---:|
| All gates, all pools *(ceiling)* | $9,514 | $693.70 | **$8,820** | 7.29% |
| All gates, real contests | $5,141 | $361.55 | **$4,779** | 7.03% |
| No mode gate, all pools | $4,099 | $280.45 | **$3,819** | 6.84% |
| **No mode gate, real contests** *(conservative)* | $3,773 | $257.15 | **$3,516** | 6.82% |

Player side on the same basis: cosmetics $405 gross → **$317 net** (21.7% — see (b)); Pool Pro at 1–3%
of players $1,755–5,265 gross → **$1,645–4,934 net**; Pool Ultra $0, no venue customers.

> **Effective blended rate on the admin ladder is ~7%, not 5%** — because Plus at $19 is the volume
> product and carries a 7.6% effective rate. Any revenue figure elsewhere in this document should be
> discounted ~7% to reach cash.

#### Two Bermuda-specific items to confirm before signing

Neither is answerable from public documentation and both are worth an email to Paddle:

1. **Payout currency.** Payouts are free only when the payout currency matches the bank's country
   currency. Bermuda's dollar is pegged 1:1 to USD and local banks hold USD accounts, but if Paddle
   classifies a Bermuda payout as international it is **$15 per payout** plus up to **1.5% conversion**.
   On a $3,500 tournament that is up to $67 — 1.9% on top of the 7%. Ask before assuming.
2. **Small-ticket rate.** Confirm whether the sub-$10 custom pricing applies to cosmetics, and what it
   would be, before phase 2 is scoped around a $1.99 price point.

### 5.2 Pool Pro — the plan's headline is optimistic; its own footnote is right

The plan headlines **5% of players × $39/yr ≈ $82,000** at 50K users, then contradicts itself in the
caveats: *"first year likely 2–3%"* and *"treat the $82K projection as a ceiling, not a forecast."*

The engagement data says the caveat is the honest number. Only **5.8%** of users were active across
all four tournament phases and only **6.8%** ever typed a message. A 5% *paid* conversion would mean
converting essentially the entire deeply-engaged cohort, which no consumer app achieves.

| Conversion | Subscribers @ 50K users | Revenue / yr |
|---|---:|---:|
| 1% | 415 | $16,185 |
| 2% | 830 | $32,370 |
| **3%** *(plan's own first-year estimate)* | **1,245** | **$48,555** |
| 5% *(plan's headline)* | 2,075 | $80,925 |

**Use $16K–$49K.** Not $82K.

### 5.3 The revised stack

| Stream | May plan | Re-costed | Change |
|---|---:|---:|---|
| Admin tiers | $89,400 | **$145,600** | ▲ 1.63× — measured; **$174,200 at a 20 cap** |
| Pool Ultra (venues) | $25,000 | $25,000 | unchanged — **zero real customers, pure speculation** |
| Cosmetics | $15,000 | $15,000 | unchanged — untested |
| Pool Pro | $82,000 | **$16,000–48,600** | ▼ — plan's own caveat |
| Merchandise | $12,000 | $12,000 | unchanged — ships last |
| **Total** | **$223,400** | **$213,600–246,200** | ≈ flat |

**The total barely moves. The mix inverts.** The plan's thesis was that admin revenue is structurally
weak and the player base is the unlock. Measured, it is closer to the reverse: the admin ladder is the
dependable half and the player subscription is the speculative one.

This does not kill Pool Pro — §6.5's "every user monetisable" still holds, and $16–49K is real money.
It changes the **build order**. See §7.

### 5.4 What it is worth *today*

Every figure above is anchored to 50K users. We have **4,827**. At current scale, one competition:

| Stream | Realistic |
|---|---:|
| Admin tiers (~50% conversion) | ~$1,760 |
| Pool Pro (1–3% of players) | ~$1,750–5,300 / yr |
| Cosmetics (3% × $3) | ~$400 |
| Ultra / merch | $0 — not built, no customers |
| **Total** | **~$4,000–7,500 / yr** |

**That is the number that matters for planning**, and §5.1b confirms it against the real tournament:
the entire World Cup would have yielded **~$3,200–11,100**. Monetisation at current scale does not
fund a business; it offsets hosting. That is entirely consistent with §6.5 — *"still in the self-funding
phase"* — and it argues for building the cheapest lane first rather than the most lucrative one.

---

## 6. 🔴 Decision 1 — free-tier banter and XP

**`SPORTPOOL_VISION.md` §10 names this as blocking:** *"§9.1 — free-tier banter. Needs Ryan's call;
blocks monetisation design. Trigger: whenever monetisation is next picked up — this is the first
question in that work, not a detail inside it."*

This is that moment. Here is the data that was not available when §9.1 was written.

### The May plan turns banter off for the only pools where banter works

Free tier = pools of ≤10 members = **488 of 623 pools (78.3%)**. Now overlay conversation:

| Band | Tier under May plan | Human msgs/member | % who ever type |
|---|---|---:|---:|
| 2–4 | **Free — banter OFF** | 0.42 | **15.3%** |
| **5–9** | **Free — banter OFF** | **1.24** ← peak | **14.5%** |
| 10–19 | Paid — banter on | 0.54 | 9.5% |
| 20–49 | Paid — banter on | 0.26 | 7.6% |
| 50+ | Paid — banter on | 0.07 | 2.4% |

**The two highest-conversation bands in the entire dataset are both inside the free tier.** The May
plan would switch banter off in exactly those bands and keep it running in the three where it
demonstrably does not fire. The post-mortem states it directly: *"The 5–9 pool is where the product's
stated purpose — bringing people together — actually happens."*

Add the counter-metric. Vision §8.1 makes *the share of members who actually said something* the
purpose counter-metric and records it as **already failing** — ~7% of members post, ~64% of messages
are robot share-cards. Paywalling speech in 78% of pools moves that number the wrong way.

### Recommendation

> **Banter is free, for everyone, unrestricted. Not read-only, not capped, not delayed.**
>
> **The Form tab (XP, badges, level runway) is free too**, per §9.2's ruling that a retention mechanic
> aimed at drifting players cannot be withheld from the tier most likely to contain them.

**What it costs:** the Free→Plus upsell loses its two most emotive hooks. That is a real loss and this
is a genuine trade, not a free win — §9.1 says so.

**What remains as Free→Plus levers:** the member cap (10), entries per person (1), mode selection
(1 default vs all), custom scoring, and pool branding. Five levers, and the member cap is the one
doing most of the work already — it is what pushes ~125 pools into paying (§5.1).

**Why this is the right trade:** the free tier is the top of the funnel for a product whose primary
metric is *repeat commissioners*. 51.2% of pools never got a second member. Shipping those admins a
silent room makes the single worst number in the post-mortem worse, to protect an upsell that the
member cap already delivers.

---

## 7. 🔴 Decision 2 — build order

The May plan's order was: admin tiers → Ultra + cosmetics → Pool Pro → self-serve venue + merch.
The re-costing supports keeping it, for a reason the plan did not have: **the admin ladder is now the
dependable half, and it is also the cheapest to build** (Stripe Checkout, web-only, no mobile IAP, no
subscription lifecycle, no proration, no dunning).

| Phase | Build | Why here |
|---|---|---|
| **1** | Admin tiers — Free / Plus / Max, Stripe Checkout, web-only | Highest measured revenue, lowest build cost, no store policy exposure. Sizing confirmed against production (§5.1). |
| **2** | Cosmetics marketplace | Validates *"will players pay at all"* for a fraction of Pool Pro's cost. Gate: proceed to phase 3 only at **≥2% paying-player conversion**. |
| **3** | Pool Pro subscription | Only after phase 2 clears its gate. Subscription infrastructure is the expensive commitment — recurring billing, cancellation, proration, churn. |
| **4** | Pool Ultra, hand-sold | $500 × zero existing customers. Hand-sell 1–2 venues before generalising. Do not build the self-serve dashboard or the 14-template marketing pack on spec. |
| **Deferred** | Merchandise, sponsorship, white-label | Heaviest build, thinnest margin, needs Printful and shipping logistics. |

**One change from the plan:** it scheduled admin tiers for *"3a (Jul–Aug 2026)"* — now. That is the
same window as the Premier League launch, and the league scoring engine only landed this week. Pricing
work should not compete with getting the flagship competition scoring correctly. **Phase 1 should
follow EPL launch, not accompany it.**

---

## 8. 🔴 Decision 3 — the refund and cancellation stance

The plan's open question 7 was never settled: *"Subscription cancellation policy — pro-rated refunds
vs end-of-period only? Industry standard is end-of-period; lean that direction."*

**The live [Refund Policy](../app/refund-policy/page.tsx) already commits us to a position** — it was
published on 2026-08-23 to support a payment-service application. What it says:

- One-time tier purchases: **full refund within 14 days**, provided the pool has not started
- Always refundable if the competition never starts, or if we fail to deliver
- Pool Ultra: full refund >30 days before the tournament; partial inside 30 days, less anything
  already produced (the marketing pack is made to order)
- Subscriptions: **cancel any time, effective end of period, no proration** — the plan's own lean
- Entry fees between members and admins: **not ours to refund**, because we never receive them

This needs your ratification rather than your design. If you disagree with any of it, the page is live
and should change.

⚠️ **The live Refund Policy does not yet name Paddle as Merchant of Record, and it should.** Under an
MoR arrangement **Paddle becomes the seller** — it is the name on the customer's statement, it holds
the tax obligation, and refunds are issued through it rather than by us directly. The published page
was written processor-neutral (§7 covers only Apple/Google) and §10 says *"once we approve it, we
issue it the same day"*, which is a shade off once Paddle is in the path. Nothing on the page is
misleading today, because nothing is on sale — but two edits are needed before anything is:

- Name Paddle as Merchant of Record and seller of record for platform purchases
- Say refunds are issued **through Paddle** to the original payment method

A reviewer comparing our published terms against our Paddle account will look for exactly this.

⚠️ **The Terms of Service contradict all of this and must be amended before anything goes on sale.**
`app/terms/page.tsx` §1 calls SportPool *"a free prediction pool platform"* and §5 states we *"do not
collect, hold, process, or disburse money"* and are *"not a payment processor."* Today that is true and
consistent — nothing is for sale. **The day a tier goes on sale it becomes false.** The amendment must
be surgical: §5's language about *prize money* is legally load-bearing (constraint 1) and must survive
intact; what changes is the addition of a flat platform fee. Do not let a careless edit weaken the
prize-money clause.

---

## 9. Gate check

Applying Decision 8's five gates to each mechanic. This is the check that should have happened at
design time.

| Mechanic | 1 Disclosure | 2 Affect | 3 Symmetry | 4 Substitution | 5 Variance |
|---|---|---|---|---|---|
| Admin tiers (one-time) | ✅ *"Pools over 10 people cost $19 a season"* | ✅ pride in hosting | ✅ nothing recurring to exit | ✅ more pool, not more sessions | ✅ none added |
| Member cap at 10 | ✅ *"the 11th member needs a paid pool"* | ⚠️ frustration is the mechanism | ✅ | ✅ | ✅ |
| Pool Pro | ✅ *"deeper stats about your own predictions"* | ✅ curiosity, pride | ⚠️ **must build one-tap cancel** | ⚠️ **stats yes; celebrations are session-bait** | ✅ once §3.3b applies |
| Cosmetics | ✅ you buy the thing you chose | ✅ | ✅ one-time | ✅ | ✅ **only if never randomised** |
| Pool Ultra | ✅ | ✅ | ✅ | ✅ | ✅ |
| ~~Banter paywall~~ | ❌ **fails** — *"pay so your friends can talk"* | ❌ | — | ❌ | — |

Three things fall out of this table:

- **The banter paywall fails gate 1 outright.** Independent of §6's data, it does not survive its own
  tooltip. That is the disclosure gate working as designed.
- **The member cap passes but is uncomfortable** — frustration is the conversion mechanism. It is
  honest frustration (the limit is stated up front, at pool creation, not discovered at member 11) and
  the plan's guardrail is right: hard cap at the database level, no nag screens. Keep it that way.
- **Pool Pro has two conditional gates** and both are build requirements, not design questions: exit
  must be as prominent as entry (gate 3), and *"animated rank-up celebrations"* needs a quality
  counter or it is a session-driver wearing a feature's clothes (gate 4).

---

## 10. Open decisions, collected

Everything that needs Ryan, in one place.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 🔴 1 | **Free-tier banter and XP** | **Free, unrestricted.** §6 | All pricing design. Vision §10 calls it *"the first question"* |
| 🔴 2 | **Build order and timing** | Admin tiers first, **after** EPL launch. §7 | Any engineering start |
| 🔴 3 | **Ratify the published refund stance** | As shipped; **name Paddle as MoR** and amend ToS before any sale. §8 | Payment-service application |
| 🟢 4 | Plus ceiling — 30 or 20 members? | **Tighten to 20 — measured +19.6% revenue** ($3,515 → $4,205/tournament) with no price change. §5.1 | Price list |
| 🟡 5 | Max price — $49 or $39? | Hold $49. Nothing in the data argues for a cut | Price list |
| 🟡 6 | Pool Ultra sign-up — self-serve or hand-sold? | **Hand-sell 1–2.** Zero venue customers exist; the dashboard is unbuilt | Phase 4 |
| 🟡 7 | Is the "Pro" mark visible to others? | Visible but subtle — profile and leaderboard only, never a banter announcement | Pool Pro design |

---

## 11. Risks

| # | Risk | Standing |
|---|---|---|
| RM-01 | App Store may require IAP for in-app digital purchases | **Mitigated by build order** — phase 1 is web-only. Revisit at phase 3. |
| RM-02 | Venue adoption entirely unproven | **Confirmed** — zero venue customers in the World Cup data. Hand-sell before generalising. |
| RM-03 | Player IAP conversion may be far below projection | **Sharpened** — 6.8% ever typed a message. Cosmetics gate at ≥2% before Pool Pro. |
| RM-04 | *"Admin tier alone is structurally low-revenue"* | ⚠️ **Materially weakened.** Measured at 2.44% of users, not 1.6% — worth ~1.63× the plan's figure, or **1.95× at a 20-member Plus cap** (§5.1). |
| RM-06 | Subscription churn erodes Pool Pro | **Stands, and matters more** now Pool Pro is the speculative half. |
| RM-08 | **New — the free cap collides with the worst number in the post-mortem** | 51.2% of pools never reached 2 members. A cap that makes small pools *feel* penalised attacks the primary metric. The cap must read as generous (10 is above the 5–9 sweet spot), never as a nag. |
| RM-11 | **New — the price list is fee-hostile at the low end** | Paddle's fixed 50¢ costs 30% on a $1.99 cosmetic and 15% on a $4.99 monthly sub, and sub-$10 products fall outside standard pricing entirely. Resolve before phase 2 (§5.1c). |
| RM-10 | **New — the mode gate is 57% of modelled revenue and behaviourally fragile** | If *progressive* costs $19 and *full_tournament* is free, admins pick the free format rather than pay — they are choosing a game, not buying a feature. Backtest without the mode gate before relying on it (§5.1b). |
| RM-09 | **New — EPL may not monetise like a World Cup** | Every 4-tournaments-per-year figure assumes it does. A 38-week season with no single kickoff has no equivalent two-week signup spike. Measure phase 1 against EPL before extrapolating. |

---

## 12. Sources

- `MONETIZATION.md` — v1.0, May 2026. Restored from `d8927d7` on the unmerged `scale/pool-caching-phase1` branch; now on `master`.
- `SPORTPOOL_VISION.md` — §6.5 (charge everyone fairly), §6.6 + §9.4 (no invented randomness), §8.1 (purpose counter-metric), §9.1 (🔥 the banter conflict), §9.2 (the XP ruling), §10 (still open).
- `drafts/2026-08-08_world_cup_2026_post_mortem_analytics.md` — every measured figure in §4 and §5.
- `drafts/2026-07-25_entry_fee_collection_assessment.md` — constraint 1, and why it is legal rather than preferential.
- `SPORTPOOL_PROGRAMME.md` — Decision 8 (the five gates).
- Live pages: `app/pricing/page.tsx`, `app/refund-policy/page.tsx` (published 2026-08-23).

---

**Owner:** Ryan Sousa. **Prepared by:** Claude, 2026-08-23.
**Next step:** decisions 1–3 in §10. Nothing should be built before decision 1 is made — Vision §10 is
explicit that it is the first question in this work, not a detail inside it.
