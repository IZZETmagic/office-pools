---
name: project-backlog-avatar-cosmetics
description: Long-term play — full character avatars (Bitmoji / Memoji / NBA 2K MyPlayer style) with a cosmetics microtransactions economy. Candidate monetization model. Phase 3c+, gated on Phase 2 monetization decision and Avatars v1 adoption signal.
metadata:
  type: project
---

The vision: every player has a customizable character avatar that appears in their matchup card, Showdown reveal animation, banter messages, and pool leaderboard. Users can earn or buy cosmetics — team jerseys, reveal-animation themes, victory celebrations, accessories — that personalize that character. This is the engagement-and-monetization layer that turns Showdown from a pick'em product into a *light competitive game*.

**Why this is worth tracking now:** because today's decisions (avatar schema, animation architecture, character/silhouette layering in the reveal) need to *not block* this vision, even though we're not building it now. The Avatars v1 work ([[project-backlog-avatars]]) is the foundational step; this is what it enables.

**Why this is a real monetization candidate:** cosmetics-only revenue is the cleanest IAP model in software — see Fortnite (~$5B/year, cosmetics-only), Roblox (avatar economy), NBA 2K MyTeam. Key properties: low friction per transaction, optional (no paywall on core product), users *actively want* to buy (vs. paywall = resented), scales with engagement. For an office pool product where the core value is *who you're playing with* (your friends), buying a jersey to repping in front of your mates is genuinely fun, not extractive.

**Reference products worth studying:**

- **Fortnite (Epic Games)** — pure cosmetics economy, ~$5B/year revenue at peak. Limited drops drive urgency. Battle Pass = progression layer on top of microtransactions.
- **Bitmoji / Memoji** — proves users *will* invest meaningful time in customizing identity. Both free; the existence of free options doesn't kill paid customization elsewhere.
- **NBA 2K MyPlayer** — full character creation + paid cosmetics that show up in-game. Closest sports product analog.
- **FIFA Ultimate Team** — gated more aggressively (cards) but proves football fans will pay for digital identity in a football context. Showdown's positioning is opposite — cosmetic-only, no gameplay-affecting purchases — which avoids FUT's loot-box backlash.
- **Roblox avatar marketplace** — UGC-driven cosmetics. Probably out of scope for us but interesting end-state if scale supports it.
- **Discord Nitro (avatar GIFs, banners)** — proves even small identity touches drive paid conversion in social products.

**Phased path (long-term — these phase in over years, not weeks):**

### Phase A — Identity foundation (Phase 3a.5)
Covered by [[project-backlog-avatars]]. Photo upload + initials fallback. ~3-5 days. **This is the gate that unlocks everything below.**

### Phase B — Character avatars (Phase 3c+, ~6-8 weeks)
Replace photo avatars with a simple character system: head + body + outfit + accessories, all free to start.
- Build options:
  - **Ready Player Me SDK** — third-party 3D avatar service. Mature, cross-platform, generous free tier. Fastest path to a character system.
  - **Bitmoji-style 2D SVG layers** — in-house. More control, more work.
  - **AI-generated avatars from photo** — fed photo → generated stylized character. Novel but expensive per-render and may date.
- Free customization: skin tone, hair, eyes, basic outfit, team scarf.
- Adoption signal: do players customize? If yes → Phase C is viable.

### Phase C — Cosmetics economy (Phase 3c++, ~3-6 months)
- Premium cosmetics: team jerseys (real club kits — licensing question), special outfits, accessories (sunglasses, hats), themed for tournaments (World Cup throwback kits etc.).
- IAP infrastructure: StoreKit (iOS), Play Billing (Android), Stripe (web).
- Currency: premium currency ("PoolPoints"?) + earned currency for free progression. Conversion strictly one-way (real money → premium → cosmetics; earned currency for free cosmetics only).
- Inventory system: owned, equipped, gifted-to-friend.
- Marketplace UI: featured, new, limited-edition.
- Drop schedule: weekly featured items, seasonal collections tied to tournaments.

### Phase D — Reveal-animation cosmetics (Phase 3c+++, batch with Phase C)
The Showdown tunnel walk-out reveal becomes the cosmetic showcase. Layer options:
- **Tunnel theme** — Champions League, Premier League, MLS, NBA arena, neon arcade (the original Hyped mood), pub interior (the original Office-pool mood), custom team stadiums.
- **Walkout animation** — confident strut, slow march, comedic skip, sprint, mocking.
- **Victory celebration** — siu, knee-slide, flex, robot dance — plays on the duel result card if you win.
- **Intro music** — short audio clip from your premium library.
- **Entrance graphic** — your name plate styling.

Each cosmetic slot is independent → combinatorial value (your full setup is yours). This is where the moods we generated as storyboards (Irreverent, Office-pool) become *unlockable cosmetic themes* — Cinematic is the base, the others are bought or earned.

**Critical: keep gameplay separate from purchase.** No cosmetic affects pick accuracy, scoring, or any competitive outcome. This is the only sustainable model for a social-trust product (friend pools collapse if someone "pays to win").

### Phase E — UGC and social economy (~12+ months, only if Phase C succeeds)
- Gifting cosmetics to friends.
- Trading marketplace (only if regulatory clarity exists).
- User-generated cosmetics (designer revenue share).
- Branded collaborations (real teams, real leagues — licensing).

This is so far out it's barely worth scoping — just keep the system flexible enough not to block it.

**What today's decisions need to NOT block:**

1. **Avatar storage schema** — `users.avatar_url` is a text URL today. Will need to evolve to `users.avatar_config jsonb` (storing equipped cosmetics) later. Migration is straightforward; just don't lock into URL-only too rigidly in the `<Avatar>` component's API.
2. **`<Avatar>` component API** — should accept either a URL prop (Phase A) OR a config object (Phases B+). Build the component to handle both from day one if possible (`source: { url?: string; config?: AvatarConfig }`).
3. **Showdown reveal animation architecture** — silhouette/character layer must be swappable. Already designed this way in `assets/showdown-storyboard/MOTION_SPEC.md` — the figures are a distinct z-layer that can be replaced without changing timing or beats.
4. **Monetization decision (R-10 / Phase 2)** — cosmetics microtransactions added as the 6th option. The decision should consider this as viable even if not v1 — keeping it on the table influences platform sequencing.
5. **App store readiness** — IAP requires App Store Connect and Play Console properly set up. Already needed for Expo build (R-05); cosmetics extends but doesn't change the requirement.

**What this is NOT in scope for:**

- Phase 3a (Showdown launch) — way too much for a 4-week sprint.
- Phase 3a.5 (Avatars v1) — that's the photo upload step. This is a different, much bigger project.
- Phase 3b.1 (mobile polish + Android GA) — still focused on parity and shipping mobile.
- Probably Phase 3c.1-3c.6 (multi-sport foundation) — but Phase 3c is multi-month and could include this as a parallel track.

Realistic landing: Phase 3c+ or later — late 2026 / early 2027 earliest. **Only worth investing real time in IF (a) Avatars v1 shows adoption > 40% within 3 months of launch AND (b) Phase 2 monetization decision lands on cosmetics microtransactions as the chosen model.**

**Open questions for whenever this enters active scope:**

- Build vs. buy the character system (Ready Player Me vs. in-house).
- Licensing for real-team cosmetics — direct licensing deals (expensive) vs. user-uploadable color schemes (free, less premium).
- Currency design — premium-only vs. dual-currency.
- Drop cadence — engagement driver vs. fatigue driver.
- Pricing — $0.99 floor for impulse buys vs. $4.99+ for premium drops.
- Geographic / age restrictions on IAP — App Store rules vary.
- How does this interact with the Banter Cup payout in Showdown? (Already-existing real-money flow could intersect.)

Related: [[project-backlog-avatars]] (the v1 step this depends on), [[project-backlog-showdown]] (the product surface where cosmetics show up most visibly), [[project-backlog-showdown-animations]] (the reveal animation that becomes a cosmetic showcase), [[project-backlog-monetization]] (the Phase 2 decision this is a candidate for).
