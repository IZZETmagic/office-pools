# Office Pools — Monetization Plan

**Status:** Design proposed (May 2026); payment provider set to **Paddle** (Aug 2026). Validated against 2026 World Cup pool data. Pending final survey signal in Phase 2. No payment infrastructure built yet.

> ⚠️ **Open blocker:** Paddle's Acceptable Use Policy explicitly prohibits fantasy sports leagues and sports forecasting with prizes, and prohibits physical goods entirely. Nothing here is buildable until Paddle approves the account in writing. See **RM-08** and **RM-09**.

For ongoing project state, see `memory/project_backlog_monetization.md`. For roadmap context, see `SPORTPOOL_PROGRAMME.md` (§1 Phase 2, §2 backlog index, §3 TD-05).

---

## Principles

1. **No gambling.** The platform never holds prize money, never takes a rake from a prize pool, never settles bets. All revenue is a service charge for organizing tools and venue experience. Pools that involve money continue to settle off-platform if admins choose. **Under Paddle this stops being only an ethical principle and becomes a payment-processing constraint** — Paddle's AUP prohibits "fantasy sports leagues" and "Sports forecasting/odds making where monetary or material prizes are involved". The fact that no prize money ever touches the platform is the argument that keeps SportPool sellable.
2. **Event-based for admins, continuous for players.** Pool admin revenue is per-tournament one-time. Player revenue is a mix of one-time microtransactions and tournament-agnostic subscriptions, depending on the engagement pattern.
3. **Two independent ladders.** The admin tier (what features exist in a pool) and the player tier (how the player experiences whatever exists) layer cleanly. Neither replaces the other.
4. **Honest pricing-page framing.** Subscriptions and bundles are marketed for the engagement segment they actually serve, not as one-size-fits-all.
5. **The bar tier is the leverage point.** Consumer admin pricing pays for hosting and Paddle overhead (5% + 50¢ per transaction). Pool Ultra is where the business model lives.

---

## Payments — Paddle as Merchant of Record

**Decision (Aug 2026):** Paddle, not Stripe. Paddle is a Merchant of Record (MoR), not a payment processor — it becomes the legal seller of record for every transaction.

### What that buys

- **Global tax handled.** Paddle registers for, collects, and remits VAT / GST / US sales tax in every jurisdiction it sells into. For a Bermuda-based operator selling $19–$500 tiers into the UK, EU and US, this removes the need to track nexus thresholds or hold foreign tax registrations. This is the single reason to prefer Paddle over Stripe.
- **Chargeback and fraud liability sits with Paddle**, not with us.
- **Localized checkout and pricing** in supported markets, plus subscription billing, out of the box.

### What it costs

**5% + 50¢ per checkout transaction**, all-inclusive — no monthly fee, no separate tax-compliance fee. Compare Stripe at roughly 2.9% + 30¢, *plus* tax compliance handled by us.

The fixed 50¢ makes the effective rate highly price-dependent:

| Product | Price | Paddle fee | Effective rate |
|---|---|---|---|
| Pool Plus | $19 | $1.45 | 7.6% |
| Pool Max | $49 | $2.95 | 6.0% |
| Pool Ultra | $500 | $25.50 | 5.1% |
| Pool Pro *(monthly)* | $4.99 | $0.75 | 15.0% |
| Pool Pro *(annual)* | $39 | $2.45 | 6.3% |
| Cosmetic item | $2.99 | $0.65 | 21.7% |

**Two consequences:**

1. **Push annual over monthly on Pool Pro.** At $4.99/month Paddle takes 15% — and does so twelve times a year. The $39 annual plan is already framed as "save 35%" for the player; it is also the materially better deal for us. Annual should be the default-selected option.
2. **Sub-$10 items are the weak spot.** Paddle's pricing page states: *"If you're selling products under $10 or require invoicing contact us for custom pricing"* — so the $1.99–$4.99 cosmetics and the $5 digital trophy need a custom rate negotiated before Vector 1 ships on web. On mobile they route through RevenueCat / App Store IAP and are unaffected by this.

### What Paddle cannot process

- **Physical goods are prohibited outright** — "Physical products, or products that require physical delivery". This removes Vector 3 merchandise (T-shirt, mug, medal) from the Paddle rail entirely. See **RM-09**.
- **Prize-money flows** — already excluded by Principle 1, but now for commercial reasons too. See **RM-08**.

### Integration surface

| Concern | Paddle mechanism |
|---|---|
| Checkout | Paddle.js overlay or hosted checkout |
| Catalog | Paddle products + prices *(mirrors the tier table above)* |
| Recurring | Paddle Subscriptions *(Pool Pro, web)* |
| Server events | Notification destinations — `transaction.completed`, `subscription.created`, `subscription.updated`, `subscription.canceled` |
| Environments | Sandbox (`pdl_sdbx_` key) for build + test; Live (OAuth) for production |
| Mobile | **Unchanged** — RevenueCat + App Store / Play IAP. Paddle is web-only here. |

Agent tooling for all of the above is wired up in `.mcp.json` (`paddle-sandbox`, `paddle-live`, `paddle-docs`). Build and test everything against sandbox first.

---

## Pool Tiers (admin-paid, per tournament)

The four tiers an admin chooses when creating a pool. One-time fee per tournament. No subscription.

| | **Free** *(Small Pool)* | **Pool Plus** | **Pool Max** | **Pool Ultra** |
|---|---|---|---|---|
| **Best for** | Friends & family | Office / friend group | Big organized pool | Sports bars and venues going all-in on a tournament |
| **Price** | $0 | $19 / season | $49 / season | $500 per tournament |
| **Members** | Up to 10 | Up to 30 | Unlimited | Unlimited |
| **Entries per user** | 1 | Up to 3 | Unlimited | Unlimited |
| **Pool modes available** | 1 default per competition | All modes | All modes | All modes |
| **Custom scoring config** | — | ✅ | ✅ | ✅ |
| **Form tab** *(XP, badges, level runway)* | — | ✅ | ✅ | ✅ |
| **Banter** *(mentions, reactions, badge flex, share-prediction)* | — | ✅ | ✅ | ✅ |
| **How Others Predicted** *(post-deadline)* | — | ✅ Member picks | ✅ Picks + crowd analytics | ✅ Picks + crowd analytics |
| **Pool branding** *(name, emoji, color)* | Generic | ✅ | ✅ | ✅ |
| **Custom landing page** | — | — | ✅ | ✅ |
| **Custom TV leaderboard** | — | — | ✅ | ✅ |
| **Broadcast email to members** | — | — | ✅ | ✅ |
| **CSV export of standings** | — | — | ✅ | ✅ |
| **Multi-pool venue identity** *(within the same tournament)* | — | — | — | ✅ |
| **Public bar profile page** `officepools.com/bar/[slug]` | — | — | — | ✅ |
| **Venue directory listing** | — | — | — | ✅ |
| **Hosted public `/tv?venue=…` page** | — | — | — | ✅ |
| **Live in-bar ticker on TV** | — | — | — | ✅ |
| **Match-night push to patrons** | — | — | — | ✅ |
| **Marketing pack** *(auto-generated print-ready PDFs)* | — | — | — | ✅ |
| **House champion ledger** *(persistent across tournaments)* | — | — | — | ✅ |
| **Bar-specific badges + awards pack** | — | — | — | ✅ |
| **Multi-staff admin accounts** | — | — | — | ✅ |
| **Promo code / drink-token tools** | — | — | — | ✅ |
| **Patron retention dashboard** | — | — | — | ✅ |
| **Self-serve sponsor slot** | — | — | — | ✅ |
| **Weekly winner crown mechanic** | — | — | — | ✅ |
| **Billing** | — | One-time per season, Paddle Checkout | One-time per season, Paddle Checkout | One-time per tournament, Paddle Checkout |

### Default mode per competition (Free tier)

The free tier gets the simplest mode for the competition. Paid tiers unlock the full catalog.

| Competition | Default mode (Free) | Modes unlocked on Plus+ |
|---|---|---|
| World Cup / Euros | Full | Progressive, Bracket |
| Premier League / La Liga | Weekly pick'em | Season-long predictor, H2H Showdown |
| FA Cup / Champions League knockout | Bracket | Round-by-round progressive |
| Super Bowl squares | Single-game squares | Multi-game squares, prop predictions |
| NFL / NBA regular season | Weekly pick'em | Season-long, survivor |

Mode availability per competition becomes config under TD-05 (pool template system, Phase 3c.3). Until that lands, mode gating is only enforceable for WC.

### Mix-and-match rule

Each tournament is its own purchase. A bar can buy Pool Ultra for EPL ($500), Pool Max for the FA Cup ($49), and skip the Champions League entirely. Any admin can buy any tier. **Pool Ultra is opt-in, not required for venues.**

### Upsell logic

- **Free → Plus** ($19): unlocks the actual product experience — banter, form/XP, all modes, custom scoring, pool branding.
- **Plus → Max** ($49): unlocks the audience experience — bigger pool, custom landing page, custom TV leaderboard, broadcast email, exports.
- **Max → Ultra** ($500/tournament): unlocks the venue experience — public hosted TV page, foot-traffic engine, marketing pack, multi-staff admin, house champion ledger, sponsor slot.

### Free-tier guardrails

1. **11th member can't join.** Hard cap at the database level — the 11th person sees "this pool is full, ask the admin to upgrade." No soft-cap nag screens.
2. **Admin upgrades mid-season.** Features unlock retroactively. No data deleted. Banter/form history preserved.
3. **Free pool data retention.** Free pools persist after the tournament ends. Free is a real product, not a trial.

---

## Pool Ultra — marketing pack detail

The $500 venue tier includes a fully-automated print-ready marketing pack. The bar fills out a branding form once; the server auto-stamps every layout with their logo / colors / QR code via `pdf-lib`.

### Common parameterized fields (all templates)

- `bar_name`
- `bar_logo` *(SVG preferred, PNG ≥300dpi accepted)*
- `primary_color` / `secondary_color` *(hex)*
- `qr_target` *(auto-generated: `officepools.com/bar/[slug]`)*
- `tournament_name`
- `pool_name` *(optional override)*
- `tagline` *(optional)*

### Print pack (core 8)

| # | Template | Size / spec | Use case | Extra fields |
|---|---|---|---|---|
| 1 | Table tent | A6 folded (4-panel), CMYK, 3mm bleed | Sits on every table | — |
| 2 | Window decal / cling | A4 portrait, CMYK, sticker-vinyl spec | Walk-by foot traffic | — |
| 3 | Coaster | 95mm round, CMYK, 1mm bleed | Lives under every drink | — |
| 4 | A-frame sidewalk poster | A2 portrait, CMYK, 5mm bleed | Outdoor reach | `address_line`, `opening_hours` |
| 5 | Menu / drinks-list insert | DL slip card (99×210mm), double-sided, CMYK | Tucked into menus | `featured_drink` *(optional)* |
| 6 | Bathroom poster | A3 portrait, CMYK, 5mm bleed | Captive audience | — |
| 7 | TV digital signage slate | 1920×1080 16:9, RGB | Plays between matches | `next_match_label` *(optional)* |
| 8 | Welcome flyer | A5 double-sided, CMYK, 3mm bleed | Takeaway with rules | `rules_summary`, `prize_info`, `social_handles` |

### Print-shop helper

| # | Asset | Purpose |
|---|---|---|
| 9 | Print-shop spec sheet | Bleeds, color profile, recommended paper stock, sizes — so the bar's local printer doesn't ask 14 questions |

### Social pack (RGB, bonus)

| # | Template | Size | Use case |
|---|---|---|---|
| 10 | Instagram square | 1080×1080 | Pool launch / deadline reminders |
| 11 | Instagram / Facebook story | 1080×1920 | Vertical countdown / match-night promo |
| 12 | Facebook cover | 820×360 | Page header for the season |

### Awards pack (post-tournament, auto-filled from final standings)

| # | Template | Size | Use case |
|---|---|---|---|
| 13 | Champion certificate | A4 landscape, CMYK | Printable winner certificate |
| 14 | Champion social tile | 1080×1080 | "[Player] is Champion of [Bar Name]" |
| 15 | Season-recap social tile | 1080×1080 | Top 3 finishers, total participants |

### Technical approach

Hand-design layouts once in Affinity / Adobe with proper CMYK + bleed. Export as templates with named placeholder regions. Server stamps placeholders via `pdf-lib`, zips + delivers.

- **Design phase:** ~$2,000–4,000 freelance for the full set of 14
- **Engineering:** ~1 week for the stamp-and-zip pipeline + ~3 days preview UI
- **MVP option:** ship Pool Ultra with templates 1, 2, 3, 4, 7 + spec sheet. Layer the rest as v1.1.

---

## Player-Side Monetization (three vectors)

Players currently generate zero revenue. At 50K users, ~83% of users are non-admin players — that's the biggest untapped revenue source. Three complementary vectors, all consistent with the no-subscription-for-admin / no-gambling principles.

### Vector 1 — Cosmetic Marketplace *(microtransactions)*

Small one-time IAPs. Pure cosmetics. Owned forever. Sport-agnostic. Lives across every pool the player participates in.

| Item type | Price | Examples |
|---|---|---|
| **Avatar packs** | $1.99–4.99 | World Cup country avatars, club crest packs, mascot collection |
| **Theme packs** | $1.99–4.99 | Dark variants, retro arcade, neon, tournament-edition themes |
| **Reaction packs** | $2.99 | Animated emoji bundles, sport-specific (yellow card, red card, GOAL!) |
| **Badge frames** | $2.99–4.99 | Premium frames around earned badges (gold, holo, animated) |
| **Banter effects** | $1.99 | Confetti on rank-up, custom sounds, message highlight colors |

**Properties:**
- No gameplay impact — pure visual / audio polish
- Permanent ownership after purchase
- Works in any pool tier (Free included)
- Reuses Pool Ultra's branding/stamping infrastructure for asset rendering
- Mobile-native via RevenueCat IAP
- **Web sales need a custom Paddle rate.** Every item here is under $10, where Paddle's standard 5% + 50¢ becomes punitive (21.7% on a $2.99 item). Negotiate before shipping Vector 1 on web; mobile IAP is unaffected.

### Vector 2 — Pool Pro *(subscription, tournament-agnostic)*

A continuous-engagement subscription for engaged players. Works across every pool the player is in, regardless of which sport or pool tier. Sport-agnostic by construction — no "I don't care about NFL" tension because Pool Pro doesn't sell sports, it sells a better player experience.

| Tier | Price | What's included |
|---|---|---|
| **Free player** | $0 | Default experience. Can still buy cosmetic IAP and merch à la carte. |
| **Pool Pro** | **$4.99/month** or **$39/year** *(save 35%)* | Advanced personal stats *(form curves, head-to-head, accuracy trend)*, theme picker, priority push category controls, exclusive Pro badge variants, "Pro" verified mark on leaderboards, animated rank-up celebrations, ad-free *(if ads ever launch)* |
| **Pool Pro Plus** | **$7.99/month** or **$59/year** *(save 38%)* | All Pool Pro + **1 cosmetic item per month** *(rotating curated selection)*, **year-end "Pool Pro Wrapped" recap**, **custom Pro badge designer**, **priority customer support**, **early access** to beta features |

**Why subscription works for players (and didn't for admins):**

- Engaged players are in 2–5 pools simultaneously across multiple sports — engagement is continuous even though each tournament is discrete
- Tournaments overlap across the calendar (EPL Aug–May, NFL Sep–Feb, NBA Oct–Jun) — no dormant time
- Players touch the app daily (predictions, banter, leaderboard checks)
- Value is in ongoing engagement experience, not discrete setup moments

### Vector 3 — Merchandise *(one-time, event-driven)*

Physical print-on-demand + digital collectibles. Tournament-end / victory-moment revenue. Heaviest build — ships last.

> ⚠️ **Paddle cannot process this vector.** Paddle's AUP prohibits "Physical products, or products that require physical delivery" outright. The T-shirt, mug and medal lines need a separate rail — either Stripe alongside Paddle, or Printful's own storefront checkout so the physical sale never touches our books. Only the $5 digital trophy and the $5 sticker pack are Paddle-eligible, and both are sub-$10. See **RM-09**.

| Item | Price | Notes |
|---|---|---|
| **Digital winner's trophy** | $5 | Auto-generated PDF certificate + shareable social tile with pool name + winner badge |
| **Pool-branded T-shirt** | $29 | Print-on-demand via Printful. Platform margin ~25% = $7/sale. Admin opts in. |
| **Pool-branded mug** | $19 | Same fulfilment pipeline. Platform margin ~$5/sale. |
| **Physical winner's medal** | $35 | Engraved, print-on-demand. Platform margin ~$10. |
| **Tournament edition badge stickers** | $5 *(pack of 10)* | Pure margin. Limited-edition per tournament. |

**Properties:**
- Print-on-demand → zero inventory risk
- Pool Ultra venues can sell their own bar-branded merch through the same pipeline (high-value bar + sponsor co-branded items)
- One-time purchases, no subscription mechanics
- Heaviest build: Printful integration, shipping logistics, returns

---

## How the layers stack — pool tier × player tier

The admin tier (what features exist in the pool) and the player tier (how the player experiences whatever exists) are independent. A Pool Pro subscriber carries their experience into every pool they're in.

For each Pool Pro feature at each pool tier:
- ✅ **Works** — feature operates regardless of pool tier
- ⚠️ **Conditional** — requires pool tier to enable the underlying feature first
- ❌ **Redundant** — pool tier already includes it; Pool Pro doesn't add value here

| Pool Pro feature | Free pool | Pool Plus | Pool Max | Pool Ultra |
|---|---|---|---|---|
| Custom avatar | ✅ | ✅ | ✅ | ✅ |
| Theme picker *(player's own app)* | ✅ | ✅ | ✅ | ✅ |
| "Pro" mark on leaderboard | ✅ | ✅ | ✅ | ✅ |
| Animated rank-up celebrations | ✅ | ✅ | ✅ | ✅ |
| Exclusive Pro badge variants | ✅ | ✅ | ✅ | ✅ |
| Priority push category controls | ✅ | ✅ | ✅ | ✅ |
| Advanced personal stats *(form, H2H, accuracy)* | ✅ | ✅ | ✅ | ✅ |
| Premium banter effects *(animated reactions, GIF)* | ⚠️ *(no banter)* | ✅ | ✅ | ✅ |
| Crowd analytics on How Others Predicted | ⚠️ *(no HOP)* | ✅ *(adds on top of basic HOP)* | ❌ *(Max already includes)* | ❌ *(same as Max)* |
| Pool Pro Plus extras *(monthly cosmetic, Wrapped, designer)* | ✅ | ✅ | ✅ | ✅ |

**Key insight:** ~80% of Pool Pro's value is in the ✅ column — features that work in any pool, including Free. **Free-pool players get the biggest lift from subscribing**, which is exactly the segment most worth monetizing because the admin isn't paying anything.

### What does NOT cross the layers

**Multi-entry override is deliberately NOT a Pool Pro feature.** A power player who wants 5 entries cannot buy their way around an admin's cap. This protects the admin-tier upsell (the entry-count rule was responsible for 3 of 10 paying admin tiers in the 2026 WC regression). Pool Pro Plus differentiates through cosmetic + experience extras, not gameplay overrides.

---

## Revenue stack — projection at 50K users

Conservative assumptions, all sourced from the 2026 WC regression where data exists. Numbers above 627 users involve extrapolation; treated as estimates not forecasts.

| Stream | Conversion / scale | Revenue / year |
|---|---|---|
| Admin tier *(Free / Plus / Max)* | 1.6% paying-admin rate × 4 tournaments × $28 avg | ~$89,400 |
| Pool Ultra *(venues)* | 1 bar per 2,500 users × 75% × 4 tournaments × $500 | ~$25,000 |
| Vector 1 — Cosmetics | 3% of players × $3 avg × 4 tournaments | ~$15,000 |
| Vector 2 — Pool Pro subscription | 5% of players × $39/year avg | ~$82,000 |
| Vector 3 — Merchandise | 1% of players × $7 platform margin × 4 tournaments | ~$12,000 |
| **Total revenue** | | **~$223,400 / year** |

### Processing cost — what Paddle takes

The table above is **gross revenue**. Three of the five streams run through Paddle and carry the 5% + 50¢:

| Stream | Gross | Txns *(implied)* | Paddle fee | Net |
|---|---|---|---|---|
| Admin tier | ~$89,400 | ~3,193 @ $28 | ~$6,070 | ~$83,330 |
| Pool Ultra | ~$25,000 | 50 @ $500 | ~$1,275 | ~$23,725 |
| Pool Pro *(annual, web)* | ~$82,000 | ~2,103 @ $39 | ~$5,150 | ~$76,850 |
| **Paddle-borne subtotal** | **~$196,400** | | **~$12,500** | **~$183,900** |

That's an effective **~6.4%** across the Paddle streams, or roughly **$12,500/year** at 50K users.

**This is a best case.** It assumes every Pool Pro subscriber is annual and on web. Monthly web subscribers cost 15% each, and any mobile subscriber routes through RevenueCat / App Store at 30% in year one — both materially worse than the line above. Cosmetics (mobile IAP) and merchandise (not Paddle-eligible) are excluded.

### What this changes about the business model

Without player monetization, the admin + venue tiers cap at ~$114K/year at 50K users — a meaningful side income but not a primary one. **Adding the three player vectors lifts it to ~$223K/year — roughly 2× admin-only revenue at the same user count.** The player base is the unlock.

### Caveats

- 5% paying-player Pool Pro conversion is mature-consumer-app territory; first year likely 2–3%
- Apple/Google take 30% on first-year mobile IAP subs (15% year 2+). Web Paddle takes 5% + 50¢ — still far better than IAP, but **not** the full margin the Stripe-era version of this plan assumed
- Subscription churn at month 6–12 typically 30–50% for consumer apps without strong retention features
- All player numbers are speculative until Vector 1 data exists; treat $82K Pool Pro projection as a ceiling, not a forecast

---

## Implementation roadmap

Each step gated on data from the previous step. No subscription infrastructure ships before cosmetics validate "will players pay at all."

| Phase | Build | Why this order |
|---|---|---|
| **3a.0** *(gate)* | **Paddle account approval.** Submit the business for Paddle review with the Principle-1 framing in writing *(we sell pool-organizing software; no prize money touches the platform)*. Get the answer before building anything. | Paddle's AUP names fantasy sports and prize-based sports forecasting as prohibited. A rejection here invalidates every row below it. See **RM-08**. |
| **3a** *(Jul–Aug 2026)* | **Admin tiers** *(Free / Pool Plus / Pool Max)* via Paddle Checkout, web-only. Platform charges land in their own `pool_purchases` table + `pools.tier`; **`entry_fee` is deliberately NOT reused** — it is the members' off-platform pot, and merging our revenue into it weakens the RM-08 argument. | Lowest cost, fastest validation. Doesn't depend on mobile launch. |
| **3b.1** *(Aug 2026+)* | **Pool Ultra hand-rolled** for first 1–2 venues. **Cosmetic Marketplace (Vector 1)** via RevenueCat. | Ultra: validates $500 price point with real venues before generalizing. Cosmetics: RevenueCat plumbing arrives with Expo launch anyway. |
| **3b.2** *(Oct–Dec 2026)* | **Pool Pro subscription (Vector 2)** — Paddle Subscriptions on web *(annual default)*, RevenueCat on mobile. | Only if Vector 1 hits ≥2% paying-player conversion. Validates subscription infra investment. |
| **3c.x** *(2027+)* | **Pool Ultra self-serve** — venue dashboard, automated marketing pack pipeline, public venue directory. **Merchandise (Vector 3)** via Printful integration — **on a non-Paddle rail** (RM-09). | Self-serve venue depends on multi-sport foundation. Merch is heaviest build — ship after Pool Pro confirms players spend. |
| **Deferred** | Sponsorship marketplace, corporate / white-label tier, sport pass admin subscription | Don't build until adjacent customers exist. Sport Pass rejected — admin subscription is a poor fit for event-based product. |

---

## Open questions to settle in Phase 2

1. **Final Free cap — 10 vs 8 vs 5 members?** Regression says 10 is fine. Keep at 10.
2. **Plus ceiling — 30 vs 20 members?** Data shows 21–30 band is empty. Lean to tighten to 20.
3. **Max price — $49 vs $39?** $49 is 2.5× Plus. Test in Phase 2 once admin tier ships.
4. **Free-tier banter — fully off vs read-only?** Currently designed as fully off. Read-only might preserve discovery / engagement. Open.
5. **Pool Ultra venue sign-up — self-serve from day one vs hand-rolled cohort?** User confirmed self-serve, but dashboard isn't built. Pragmatic: hand-roll first 1–2, build self-serve in parallel.
6. **Pool Pro visibility** — is the "Pro" mark visible to other pool members or only to the subscriber? Lean to **visible but subtle** — small badge on profile + leaderboard, no banter announcements.
7. **Subscription cancellation policy** — pro-rated refunds vs end-of-period only? Industry standard is end-of-period; lean that direction.
8. **Dual-rail or Paddle-only?** Vector 3 forces a second processor regardless (RM-09). Question is whether to stand Stripe up early as an approval hedge (RM-08) or stay Paddle-only until merch actually ships. Lean **Paddle-only until 3c.x**, on the condition that 3a.0 approval comes back clean.

---

## Risks

| # | Risk | Mitigation |
|---|---|---|
| RM-01 | App Store / Play Store policy may require IAP for any in-app digital-service purchase | Keep purchase flows web-only initially. RevenueCat in Phase 3b.1 for mobile IAP. |
| RM-02 | Bar adoption rate is speculative — no real venue customers in 2026 WC data | First venue cohort is hand-sold and measured. Don't generalize until ≥3 venues are renewing. |
| RM-03 | Player IAP conversion may be lower than projected (1% vs 3%) | Cosmetic Marketplace ships before Pool Pro subscription as a conversion validator. |
| RM-04 | Pool Pro could cannibalize Pool Max if players buy multi-entry from their side | Resolved by design: multi-entry override is NOT a Pool Pro feature. Pool Pro Plus differentiates through cosmetic + experience extras only. |
| RM-05 | Marketing-pack designer cost ($2–4K) is upfront before Ultra ships | MVP with 5 templates instead of 14 ($1–2K). Add the rest as v1.1. |
| RM-06 | Subscription churn could erode the projected $82K Pool Pro line | Treat as ceiling; first-year realistic at $30–40K. Build retention features (Wrapped, monthly cosmetic drop) into Pool Pro Plus. |
| RM-07 | "Default mode per competition" relies on TD-05 (pool template system) | For WC only, mode gating is enforceable today. Multi-sport mode gating waits for Phase 3c.3. |
| **RM-08** | **Paddle may reject the account outright.** Its AUP prohibits "fantasy sports leagues", "Sports forecasting/odds making where monetary or material prizes are involved", and "lotteries, auctions, contests, sweepstakes, or games of chance". As Merchant of Record Paddle carries the liability, so it screens harder than a plain processor. `app/pools/[pool_id]/admin/FeesTab.tsx` (and its mobile twin `mobile/components/pool-detail/FeesTab.tsx`) — the existing entry-fee tracking UI — could read as prize-pool facilitation during domain review even though settlement is off-platform. | **Highest-priority unknown; resolve before any build.** Approach Paddle pre-emptively with the Principle-1 framing in writing. Be ready to explain FeesTab as an off-platform record-keeping tool — and point at the schema: platform revenue lives in `pool_purchases`, never in `entry_fee`. Keep Stripe viable as a fallback — the tax-compliance work Paddle would absorb is the cost of that fallback, not a blocker. |
| **RM-09** | **Paddle prohibits physical goods**, removing Vector 3 merchandise (T-shirt, mug, medal) from the Paddle rail. | Vector 3 is the last thing built (Phase 3c.x), so this is not urgent — but it means the payment stack ends up dual-rail. Either add Stripe for physical goods, or push fulfilment to Printful's own storefront so the sale never lands on our books. Digital trophy + stickers stay on Paddle. |

---

## 2026 World Cup regression — baseline data

Tested the pricing model against actual pool data from 2026 WC (15 active pools after excluding test pools + Ryan's pools except Road to Glory).

| Tier | Pools | Revenue |
|---|---|---|
| Free | 5 | $0 |
| Pool Plus ($19) | 7 | $133 |
| Pool Max ($49) | 3 | $147 |
| Pool Ultra | 0 *(no venue customers exist)* | $0 |
| **Total** | **15** | **$280** |

Key findings:
- **91% of created pools are dead air** (<3 members or 0 submitted predictions). Free pricing isn't filtering for serious admins.
- **Office pool size clusters at 10–18 members** — this is where Pool Plus lives.
- **Two pools busted the entry cap, not the member cap.** The entry-count rule does real upsell work.
- **Plus tier 30-member ceiling is rarely hit** — could tighten to 20.
- **Ultra revenue is zero** — pure greenfield. Three Ultra signups = 5× the entire active WC admin revenue.

Full regression detail in `memory/project_backlog_monetization.md`.

---

## Cross-references

- `SPORTPOOL_PROGRAMME.md` §1 Phase 2 *(monetization decision)*, §2 *(this backlog indexed)*, §3 TD-05 *(pool template system blocking multi-sport mode gating)*
- `memory/project_backlog_monetization.md` — long-form discussion state and history
- `memory/project_backlog_feedback.md` — Phase 2 survey should test "would you pay" + "would you run a pool at a bar"
- `memory/project_backlog_data_model.md` — multi-sport foundation gating the 4+ tournament columns in revenue projections
- `memory/project_backlog_pool_templates.md` — TD-05, gates mode-level pricing enforcement
- `app/pools/[pool_id]/admin/FeesTab.tsx` — existing manual fee tracking UI (admin's off-platform pot). Mobile twin: `mobile/components/pool-detail/FeesTab.tsx`. Entry point for the admin upgrade flow, but its schema is NOT reused for platform charges.
- `lib/integrations/apiFootball/` — sports data integration; variable cost per tournament
- `.mcp.json` — `paddle-sandbox` / `paddle-live` / `paddle-docs` MCP servers *(gitignored, untracked, local only. The sandbox key is a literal `pdl_sdbx_…` bearer token in the file itself — **not** an env var. `paddle-live` and `paddle-docs` are OAuth and need authorizing before use. Sandbox connection verified against the live API 2026-08-24.)*
- [Paddle pricing](https://www.paddle.com/pricing) — 5% + 50¢, and the sub-$10 custom-pricing note
- [Paddle AUP — what you can't sell](https://www.paddle.com/help/start/intro-to-paddle/what-am-i-not-allowed-to-sell-on-paddle) — source for RM-08 and RM-09

---

**Last updated:** August 2026. Owner: Ryan Sousa.

**Recent revisions:**
- v1.1 (Aug 2026) — **Payment provider switched from Stripe to Paddle.** Rationale: Paddle is a Merchant of Record and absorbs global VAT / sales-tax registration and remittance, which is the dominant consideration for a Bermuda-based operator selling into the UK, EU and US. Cost of that is 5% + 50¢ vs Stripe's ~2.9% + 30¢ — roughly $12.5K/year at the 50K-user projection. Two constraints surfaced during the switch and are **not yet resolved**: Paddle's AUP prohibits fantasy sports and prize-based sports forecasting (RM-08, now gating Phase 3a.0), and prohibits physical goods, which forces Vector 3 merchandise onto a second rail (RM-09). Also corrected the "web = full margin" caveat, which was only ever true under Stripe-with-our-own-tax-handling.
- v1.0 (May 2026) — Initial monetization plan. Four admin tiers + three player-side vectors. Sport Pass admin subscription explicitly rejected as poor product fit (event-based product, not continuous). Pool Pro player subscription added as tournament-agnostic continuous-engagement layer.
