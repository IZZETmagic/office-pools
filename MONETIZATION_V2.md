# SportPool — Monetization Plan **v2**

**Supersedes `MONETIZATION.md` (v1, May–Sep 2026).** Where the two disagree, v2 wins. v1 is retained
as the archive for material v2 does not restate: the Pool Ultra print-pack specification, the full
2026 World Cup regression working, and the Paddle integration notes.

**What v2 is for.** v1 had two monetization ladders and only one of them was designed against
evidence. The admin ladder was regressed against real pool data; the player ladder — *Pool Pro*, a
$4.99/month subscription — was designed against an assumed player who does not exist in our database.
**v2 exists to replace the player ladder with one that fits the players we actually have**, because
~90% of our users will never create a pool and today they generate nothing.

> ⚠️ **Open blocker, unchanged from v1.** Paddle's Acceptable Use Policy prohibits fantasy sports
> leagues and sports forecasting with prizes, and prohibits physical goods outright. Nothing in this
> document is buildable until Paddle approves the account in writing. See **RM-08 / RM-09**.

---

## 1. What changed, and the measurement that forced it

Measured against production on 2026-09-29 — 4,453 users across 584 non-test pools, `pool_members`
and `pool_entries` paged in full (no 1,000-row truncation):

| | Measured | What v1 assumed |
|---|---|---|
| Users in exactly **1 pool** | **94.7%** (4,215) | — |
| Users in ≥2 pools | 5.3% | — |
| Users in **≥3 pools** | **1.4%** (61 people) | *"in 2–5 pools across sports"* |
| Mean pools per user | **1.08** | implicitly ≥2 |
| Users spanning ≥2 competitions | **0.2%** | *"tournaments overlap — no dormant time"* |
| Users who admin ≥1 pool | 9.5% (425) | — |
| Users who never admin | **90.5%** | "~83%" |

**Three consequences.**

1. **Pool Pro's monthly subscription is cut.** It was designed for the continuously-engaged
   multi-pool player. That segment is sixty-one people. A subscription cannot be sold to someone
   whose entire relationship with the product is one competition, and the v1 revenue line
   (*"5% of players × $39/year ≈ $82,000"*) is the second-largest number in the stack resting on it.
2. **Principle 2 was wrong in half.** *"Per-pool for admins, continuous for players"* — player
   engagement is not continuous. It is **episodic and competition-shaped**, exactly like the admin's.
   Rewritten below.
3. **Journey 2's "the member buys nothing, ever" is retired** — deliberately, at Ryan's direction,
   and replaced with a rule that keeps what that sentence was protecting. See §4.

⚠️ **One honest caveat on the data.** The *"one competition"* figure is partly an artifact: only the
World Cup has really run, so there was little else to span. The *"one pool"* figure is **not** an
artifact — within the World Cup alone, people joined one pool and stopped. Premier League 2026/27 plus
a second league is the first real test of whether a multi-competition player exists, and §7 makes that
the gate on building any of this.

---

## 2. Principles

Carried from v1 unless marked. 1, 3, 4, 5, 6 and 7 are unchanged and still govern.

1. **No gambling.** The platform never holds prize money, never takes a rake, never settles bets. All
   revenue is a service charge for organizing tools and venue experience. Under Paddle this is also a
   payment-processing constraint, not only an ethical one.
2. 🆕 **Episodic for everyone. The competition is the clock.** *(Replaces "per-pool for admins,
   continuous for players.")* An admin buys a pool bound to a fixture list. A player buys either a
   **pass bound to a competition** or an **item owned forever**. Neither is recurring, neither has a
   card on file, and neither can lapse while football is still being played. **SportPool sells no
   subscriptions at all.**
3. **Two independent ladders.** The admin tier (what features exist in a pool) and the player's own
   purchases (how they experience whatever exists) layer cleanly. Neither replaces the other.
4. **Honest pricing-page framing.** Each product is marketed for the segment it actually serves.
5. **The bar tier is the leverage point.** Consumer pricing pays for hosting and processing overhead.
   Pool Ultra is where the business model lives.
6. **The buyer is buying for other people.** Every admin and venue purchase is made on behalf of a
   group that will never see a price. Where the flow rules derived from that asymmetry conflict with
   anything later in this document, **they win**.
7. **Size is the price axis. Length is free.** A four-week World Cup pool and a thirty-eight-matchweek
   Premier League pool cost the same, because the scarce resource is the room, not the calendar.
8. 🆕 **The get-it-elsewhere test.** A feature may be sold to one member and not another **only if the
   member who did not pay could obtain the same fact in another app.** Club form, head-to-head,
   injuries, lineups and league tables are commodity — every football app gives them away, so charging
   for the in-app version sells *friction removal*, not advantage. **Anything derived from our own
   members' picks is not commodity and is never a per-member purchase**, because the member who
   didn't pay cannot go and get it.
9. 🆕 **The paywall may promise fewer taps. It may never promise better picks.** Where the product is
   convenience, the copy must say convenience. The moment marketing claims improved accuracy we have
   asserted an edge ourselves, and made the runner-up's grievance true by our own words — whatever
   the data says. Enforced as a copy review rule with teeth: **no player-paywall string may assert
   improved accuracy, better picks, or a higher finish.**
10. 🆕 **A shared surface can only be bought by the admin.** If a feature changes a screen that the
    whole pool looks at, one member buying it is incoherent. Chat threads, polls, pinned messages,
    pool branding and crowd analytics are pool features; they belong on the admin ladder or nowhere.
11. 🆕 **Nothing live and free may be moved behind a player paywall.** Gating a shipped feature takes
    it from people who already have it. Only *new* capability is sellable. (`067`'s
    `tier_enforced_from` is the right *shape* of grandfather clause; it is not the right column.)

---

## 3. The three tests, and how any feature sorts

Every candidate runs the same three questions in order. The answers, not judgement, decide where it
goes.

| | Question | If yes | If no |
|---|---|---|---|
| **T1** | Does it change anyone's **points, rank, deadline, capacity, mode or eliminations**? | ❌ **Not sellable at all**, to anybody | → T2 |
| **T2** | Is it derived from **our own members' picks**? | ❌ **Not a per-member purchase.** Free to the pool, or on the admin ladder | → T3 |
| **T3** | Does it change a **surface the whole pool shares**? | 🔵 **Admin ladder only** (Principle 10) | ✅ **Player-chargeable** |

T1 is v1's rule, unchanged. T2 is Principle 8 applied. T3 is the structural answer to "advanced chat
features" — chat is shared, so it cannot be a per-player unlock.

---

## 4. The member, revised

v1's Journey 2 read: *"There is no journey. That is the journey."* Its instinct was right and its
conclusion was too strong. The thing it was protecting is the asymmetry in Principle 6 — nobody should
be monetized *on behalf of the group*. That survives in a narrower sentence:

> **The member buys nothing that belongs to the pool. They may buy things that belong to them.**

Four rules follow, and they are what make the lane safe:

1. **The shop lives on the account, never inside a pool.** A locked panel sitting in someone else's
   pool makes the admin's $19 look unfinished and turns every visit into an ask. Cosmetics, career
   record and Wrapped are reached from the player's own profile.
2. **The ask happens at a real moment, never on a timer.** Finishing an avatar build, winning a pool,
   a competition ending. Never a streak, never a countdown, never a nag.
3. **A member's purchase is never visible as an absence to anyone else.** A non-buyer sees a normal
   leaderboard, not a row of greyed-out slots where other people's frames are.
4. **No purchase may be required to speak.** v1's free tier switched Banter off entirely; the vision
   document already overruled that. Shape may vary. **Charging for the ability to talk to your own
   pool is refused**, on both the purpose ("bring people together") and Decision 8's affect gate.

---

## 5. The breakdown — what a non-admin can be charged for

Built-state is as of 2026-09-29 and verified against the repo, not assumed.

### 5a. ✅ Sellable — identity and cosmetics

The strongest lane, and the only one whose ownership layer is already designed: migration **183**
(2026-10-09) adds `avatar_gated_assets` + `avatar_asset_grants` and a database lock on
`avatar_build`, built for a one-off gift and meant to carry earned and paid items later. ⚠ 147's
reservation of `users.avatar_config` for *"EQUIPPED, PAID cosmetics"* is **retired** by 183: an owned
item is equipped in `avatar_build` like any other, under the lock. See rule 17.

| # | Item | Built? | Source | Tests | Indicative |
|---|---|---|---|---|---|
| 1 | **Cosmetic avatar parts** — hair, facial hair, accessories, beyond the free set | ✅ Builder + 7-tab selector shipped (`146`, `147`); art pipeline live | Ours (we drew it) | T1 no · T2 no · T3 no | **$2.99–$4.99** each |
| 2 | **Patterned kit colourways** — stripes, halves, sash, trim | ⬜ Free layer shipped (22 named colours, `146`); patterns not built | Ours | ✅ | **$2.99** |
| 3 | **Leaderboard frame / row border** | ⬜ Not built | Ours | ✅ | **$2.99** |
| 4 | **Celebration animation** on rank-up and reveal | ⬜ `MOTION_SPEC` + reveal playground exist, unreferenced | Ours | ✅ | **$3.99** |
| 5 | **Banter reaction effects** (animated reactions — **not** the ability to post) | ⬜ Not built | Ours | ✅ · §4.4 | **$3.99** |
| 6 | **Seasonal cosmetic set** — one per competition, does **not** expire | ⬜ Not built | Ours | ✅ | in the pass |

🔴 **RM-12 stands: you cannot sell a club kit.** Crests, club names and kit designs are protected
marks and `crest_url` is licensed for display in a fixture list, not resale. **Colourways only** — a
colour, a pattern and a trim, named by the user. We already own the grammar (`competitionColor.ts`,
the scouting kit component).

### 5b. ✅ Sellable — the player's own record

Descriptive, about themselves, and it only has value if they come back — which makes selling it
aligned with the repeat-player metric rather than orthogonal to it.

| # | Item | Built? | Source | Tests | Indicative |
|---|---|---|---|---|---|
| 7 | **Career record across pools and seasons** — lifetime picks, accuracy, best finish | 🟡 `readLifetimePicks` + migration **144** exist (⚠ 144's own header: the index is the wrong way round and this read will not stay cheap) | Ours, but it is **their** data about **themselves** | T1 no · T2 — their own picks, not other members' · T3 no | in the pass |
| 8 | **Advanced personal analytics** — form curve, accuracy trend, calibration | 🟡 `entryAnalytics` exists; presentation not built | Ours, about them | ✅ | in the pass |
| 9 | **Season Wrapped** | ⬜ Not built | Ours, about them | ✅ | in the pass |
| 10 | **Digital winner's trophy** — certificate + shareable tile | ⬜ Not built | Ours | ✅ | **$4.99** |
| 11 | **Competition sticker pack** (digital, new design each competition, **never expires** — binding rule 13) | ⬜ Not built | Ours | ✅ | **$4.99** / 10 |

⚠ **Item 7 needs a decision before it ships, not after.** If the lifetime dossier ships free it can
never be sold (Principle 11). Decide which side of the line it is on *now*, while nothing has been
released.

### 5c. ✅ Sellable — convenience and aggregation

This is the lane Ryan's *"the data is in other apps anyway"* argument opens, and Principle 8 is what
keeps it honest.

| # | Item | Built? | Source | Tests | Indicative |
|---|---|---|---|---|---|
| 12 | **Matchweek brief** — one screen: your pool's fixtures, both sides' form *at the ends they're playing*, who's out, what usually happens when they meet | ⬜ Parts exist (`lib/scouting/form.ts`, `h2h.ts`, `players.ts`, `readPlayers.ts`); the assembled per-matchweek brief does not | **Commodity** — every football app has it. What is ours is the *labour of assembling it for your fixture list* | T1 no · **T2 no, and this must be enforced in code** · T3 no | in the pass |
| 13 | **Injury / availability digest** for your pool's clubs | 🟡 `/injuries` verified 100% precise (⚠ returns every player twice) | Commodity | ✅ | in the pass |
| 14 | **Last-XI reference** — what each side actually fielded last time | 🟡 Data owned; `is_starter` is currently **wrong** (provider sends `substitute:false` for whole squads — open bug) | Commodity fact | ✅ | in the pass |

🔴 **Item 12 carries one hard exclusion.** The existing fixture scout sheet
(`app/api/fixtures/[fixture_id]/scout/route.ts:159`) includes `readCrowdSplit` — what SportPool's
members picked. That is **ours alone** and fails T2. The brief must be built from the commodity halves
only, and a guard test should assert that the brief's payload contains no crowd field.

⚠ **And the existing scout sheet stays free.** It is live today (the binoculars over the picker), so
Principle 11 applies: only the *new* assembled brief is sellable.

### 5d. ❌ Refused — and the reason for each

| Item | Fails | Why |
|---|---|---|
| **Opponent dossier** — how a named opponent picks, their draw rate, home bias, H2H against you | **T2** | `lib/scouting/opponent.ts`'s own header: *"there is no provider call… the half nobody else has."* The member who didn't pay cannot obtain it anywhere. Free to the pool, or admin-unlocked for the room |
| **Crowd split / "what everybody else thought" / contrarian index** (`142`) | **T2** | Derived entirely from our members' picks |
| **Our predicted-XI model output** (as distinct from the last-XI *fact*) | **T2** | The fact is commodity and sellable; our model's forecast is ours alone |
| **Extra entries / multi-entry override** | **T1** | Carried from v1. A power player cannot buy around an admin's cap — and the entry rule converted 3 of 10 paying admins in the WC regression |
| **Any scoring, deadline, capacity, mode or elimination change** | **T1** | The competition is not for sale |
| **Chat threads, polls, pinned messages, image sharing** | **T3** | Shared surface → admin ladder. One member having threads in a shared chat is incoherent |
| **The ability to post in Banter** | §4.4 | Charging for speech contradicts the purpose |
| **Randomised packs, premium currency, limited-time drops** | Decision 8 gates 1, 2, 5 | Disclosure, manufactured affect, and randomness we invented rather than inherited from the sport. Cutting all three still describes Fortnite's actual shop |
| **Physical merchandise** (T-shirt, mug, medal) | Paddle AUP | Prohibited outright. Needs a separate rail. **Deferred out of v2** |

---

## 6. Packaging, price and the processing floor

### The SKUs

| SKU | Price | Unit | Contains | Why this shape |
|---|---|---|---|---|
| **Season Pass** | **$9.99** | Per **competition**, account-level — travels to every pool you're in | Items 7–9, 12–14, plus that competition's cosmetic set (6) | One payment, ends when the football does, no card on file. The player-side version of *"it cannot expire on you in March"* |
| **Cosmetic item** | **$2.99–$4.99** | One-time, **owned forever** | Any of 1–5 | The only product that works for a once-only user: they still own it next year, and it's waiting if they come back |
| **Cosmetic bundle** | **$9.99** | One-time | 4 items, chooser not randomiser | Clears the processing floor below; explicitly *not* a loot box |
| **Digital trophy** | **$4.99** | One-time, at a win | Item 10 | Sold at a real moment, never offered to a non-winner |
| ~~Monthly / annual subscription~~ | — | — | — | **Cut.** §1 |

### ⚠ The processing floor — why nothing is priced under $2.99

Paddle takes **5% + 50¢**, and the fixed 50¢ is what decides small-item pricing:

| Price | Fee | Effective |
|---|---|---|
| $1.99 | 60¢ | **30.2%** — as expensive as App Store IAP |
| $2.99 | 65¢ | 21.7% |
| $4.99 | 75¢ | 15.0% |
| $9.99 | $1.00 | 10.0% |
| $19.00 | $1.45 | 7.6% |

**A $1.99 item on our own website costs us the same share as selling through Apple.** That is the
argument for bundling and against a long tail of 99¢ cosmetics — not a marketing preference, an
arithmetic one.

⚠ **On mobile it is worse and not optional.** Apple and Google require IAP for in-app unlocks of
digital content: **30% in year one**. A $4.99 item nets ~$3.49. Web-first where the flow allows it,
RevenueCat on mobile, and both prices set so the product works at 70%.

### Trial

Every item here passes v1's withdrawal test — *a trial may only include what can be withdrawn without
changing what the pool is* — because none of it touches capacity or mode. So a trial is *permitted*.
It is still the wrong tool: for a one-payment seasonal product the better safety net is **the 14-day
refund, stated on the paywall itself**, exactly as v1 concluded for the admin tier. No player trial.

### Entitlement architecture — three constraints from the code, not from preference

1. 🔴 **Nothing paid may live in `users.avatar_build`.** Migration 147 states it: that column is
   written by the **browser with the anon key**, guarded only for shape and length, and `145`'s
   privilege trigger is a deny-list of named columns that *cannot see inside jsonb*. An entitlement
   stored as a key in there would be settable with a single PATCH. **Paid items need their own table
   with its own policy.** ✅ *2026-10-09: that table is `avatar_asset_grants` (183). Ownership lives
   there and never in the JSON; the item itself is equipped in `avatar_build`, which is no longer
   unguarded — see constraint 2.*
2. ~~**Render must intersect, not trust.** `avatar_config` (the *equipped* selection) is member-writable
   by the same route. So the renderer composes `equipped ∩ entitled`, server-side.~~ **Amended
   2026-10-09 (Ryan), migration 183: the lock is at WRITE, not render.** There is no single server
   render to intersect at: the phone reads `avatar_build` straight from Supabase (`useHomeData`,
   `useMemberRoster`, `useMemberDetail`) and composes on the device. A trigger on `users` refuses any
   unowned gated asset on every write, from every role including the service role, and deleting a
   grant takes the asset off the face in the same transaction. Nothing un-owned is ever stored, so
   nothing un-owned is ever drawn, and "do they own this?" is still decided in exactly one place.
3. **Account-scoped, never pool-scoped.** `pool_purchases` (067) is correctly keyed on `pool_id` and
   stays that way for admin tiers. Player purchases need a sibling keyed on `user_id`. Pool-scoping
   them would mean a row per (user, pool) and every screen answering *"do I have this here?"* — which
   is the failure class already burned into this repo as **one card giving two answers** — plus one
   Apple SKU per pool, which is not a thing. The season pass is one entitlement row carrying a
   competition reference.

---

## 7. What this is actually worth, stated honestly

At 50K users, ~90.5% non-admin ≈ **45,250 players**. Conversion rates are first-year consumer
estimates, not measured; the **competitions-per-player multiplier is measured (1.0 today)** and it is
the number that dominates everything below.

| Stream | Assumption | Gross / yr |
|---|---|---|
| Season Pass | 3% × $9.99 × **1.0** competitions | ~$13,600 |
| Cosmetic items & bundles | 3% × $8 across 2 occasions | ~$10,900 |
| Digital trophy | ~4,200 pools × 1 winner × 8% × $4.99 | ~$1,700 |
| **Player-side total** | | **~$26,000** |

**This is roughly a quarter of what v1 claimed for the player side (~$109K).** The gap is not
pessimism, it is the removal of a $82K subscription line sold to sixty-one people and a "×4
competitions" multiplier that measures 1.0. Stating the smaller number is the point of v2.

**And it identifies the real lever, which is not a price.** Player revenue is ~$0.60 per player per
year, and it is low because **99.8% of players touch one competition**. Pushing the pass from $9.99 to
$14.99 moves that by a third. Getting the average player into a *second* competition **doubles it** —
and also doubles the admin line, and is the same work as the primary metric (repeat commissioners) and
the same work as the return journey that `CLAUDE.md` already blesses by name.

> **The player monetization problem is a breadth-of-engagement problem wearing a pricing costume.**
> Build the pass, but do not expect it to carry the business; the thing that carries the business is a
> player who plays two competitions a year.

### The gate on building any of it

1. **Ship nothing player-facing before Premier League 2026/27 and a second league have run.** The
   0.2%-multi-competition figure is confounded by there having been only one competition. That is the
   first honest reading, and it decides whether the pass is a $10 product or a $25 one.
2. **The cosmetics gate from v1 survives, in modified form.** Its original prerequisite — *"Avatars v1,
   photo upload, has not shipped"* — is **stale**: the character builder shipped (`146`, `147`, seven
   tabs, complete hair and facial-hair assets), which is a stronger identity layer than photo upload
   ever was. What has **not** happened is the measurement. **Replace the gate with: >40% of active
   members have built an avatar within 3 months of the builder reaching both app stores.** If people
   won't build a face for free, they won't buy a hat for it.
3. **Decide item 7 (career record) free-or-paid before it ships**, per Principle 11.

---

## 8. The admin ladder — carried forward unchanged

Unchanged from v1 in every respect; restated here so v2 is self-contained. Tiers are **capacity
bands**; bundled features ride along with room size and are not separately priced. Caps are enforced
by the database (`075`: `pool_tier_member_cap()` / `pool_tier_entry_cap()`), not the UI —
`lib/paddle/tiers.ts` is display-only and price IDs come from the environment.

| | **Free** | **Pool Plus** | **Pool Max** | **Pool Ultra** |
|---|---|---|---|---|
| Price | $0 | **$19** | **$49** | **$500** |
| Members | 10 | 30 | Unlimited | Unlimited |
| Entries per user | 1 | 3 | Unlimited | Unlimited |
| Modes | Pick'em at Results depth (leagues) / Full (tournaments) | All 7 | All 7 | All 7 |
| Custom scoring, branding, Form tab, Banter | — / capped | ✅ | ✅ | ✅ |
| Landing page, TV leaderboard, broadcast email, CSV | — | — | ✅ | ✅ |
| Venue product *(public TV page, marketing pack, multi-staff, sponsor slot, house ledger)* | — | — | — | ✅ |

**Three things v2 adds to this ladder**, all arriving from §5 rather than from new design:

| Addition | Tier | Why here and not on the player |
|---|---|---|
| **Opponent dossier + crowd analytics** | Plus and up, **pool-wide** | T2. Sold to the room, nobody has an information edge over anybody; sold to a member, they do |
| **Advanced chat** — threads, polls, pinned messages | Plus and up | T3. Shared surface |
| **Pool-wide matchweek brief** *(the room's copy of item 12)* | Max | Cleaner pitch than fifteen separate convenience purchases, and the assembly cost is per-fixture-list, not per-user |

Unchanged: **one pool, one payment, priced on size; a new season is a new pool**; the trial runs free
until the first prediction deadline locks; a trial never raises capacity and never unlocks a mode;
Ultra is hand-sold with no self-serve checkout until three venues have renewed; mix-and-match per
competition. The Ultra marketing-pack specification stays in v1 §*Pool Ultra — marketing pack detail*.

---

## 9. Binding rules

v1's thirteen, plus five. Rule 1 remains the withdrawal test.

14. 🆕 **A per-member purchase must pass all three tests in §3**, in order.
15. 🆕 **No player-paywall string asserts improved accuracy, better picks or a higher finish.**
    Reviewed as copy, enforced as a test over the paywall strings.
16. 🆕 **The player shop is reached from the account, never from inside a pool.**
17. 🆕 **A paid entitlement never lives in a member-writable column.** Its own table, its own policy,
    and ~~the renderer intersects equipped-with-entitled server-side~~ **a database lock refuses an
    unowned item at write, and a revoke removes it** (amended 2026-10-09, migration 183 — see §6
    constraint 2 for why).
18. 🆕 **Nothing live and free moves behind a player paywall.**

---

## 10. Risks

Carried: RM-01 (store IAP policy), RM-02 (venue adoption unvalidated), RM-03 (pack design cost),
RM-08 / RM-09 (Paddle AUP — **still the blocker on everything here**), RM-10 (trial lapse),
RM-11 (variable-length trial may be inexpressible in Paddle Billing), RM-12 (cannot sell club kits),
RM-13 (the ×4-competitions multiplier does not survive leagues).

**RM-04 is downgraded, not closed.** v1 answered *"admin-only revenue is structurally low"* with
~$109K of player revenue. v2's honest figure is ~$26K, so the player base narrows the gap rather than
closing it. **Pool Ultra remains the business model** (Principle 5).

| # | New risk | Mitigation |
|---|---|---|
| **RM-14** | **Convenience is a thin willingness-to-pay.** The friction being removed is "open another app for twenty seconds" — small, though repeated ten times a matchweek over 38 weeks | The pass bundles convenience with cosmetics and the career record so no single line has to carry it. Do not build item 12 standalone |
| **RM-15** | **The processing floor squeezes the cosmetics lane.** Sub-$5 web items lose 15–30% | $2.99 minimum, bundles at $9.99, no 99¢ tier ever |
| **RM-16** | **`readLifetimePicks` will not stay cheap** — migration 144's own header says the only index on `pool_entries.user_id` is the wrong way round, and the read is per dossier open, which is a tap | Fix the index before item 7 ships, paid or free |
| **RM-17** | **Two monetization documents will drift**, which is the failure already recorded for the two FAQs | v1 carries a superseded banner pointing here; v2 is governing. The next substantive change **edits v2 and nothing else** |
| **RM-18** | **The player brief could quietly acquire a crowd field** and become pay-to-win by accretion | A guard test asserting the brief payload contains no field sourced from members' picks |

---

## 11. Open questions

| # | Question | Default if unanswered |
|---|---|---|
| 1 | **Career record (item 7): free or in the pass?** Must be settled before it ships | In the pass — it is the strongest reason to renew |
| 2 | **Season Pass price — $9.99 or $14.99?** | $9.99 for the first competition, then measure |
| 3 | **Where is the pass offered?** §4.2 says a real moment, not a timer; the natural one is the first pick submission of a competition | Once per competition at first submission, dismissible, never repeated |
| 4 | **Does the pass roll into a *platform* pass** once a player really does span two competitions? | Revisit only after the PL season produces the data |
| 5 | **Free-tier Banter shape** — read-only, capped, or full? *(v1's Q4, still open; the vision doc already refused "fully off")* | Capped, not off |
| 6 | **Does Pool Ultra get a venue-branded cosmetic** for its patrons? Interesting, unscoped | Out of v2 |
| 7 | **Merchandise rail** — Stripe alongside Paddle, or Printful's own checkout so it never touches our books? | Deferred; Printful checkout is the cheaper answer |

---

## 12. Cross-references

- **`MONETIZATION.md`** — v1. Superseded by this document; retained for the Ultra print-pack
  specification, the full WC regression working and the Paddle integration detail.
- `SPORTPOOL_PROGRAMME.md` → 💎 *Later — monetization & cosmetics*; Decision 8 (the five gates).
- `SPORTPOOL_VISION.md` — purpose, the refusals, and the cosmetics hard line (you buy the thing you
  chose, never a chance at it).
- `CLAUDE.md` — the disclosure gate.
- `memory/project_backlog_monetization.md` · `memory/project_backlog_avatar_cosmetics.md` ·
  `memory/project_vision_purpose_strategy.md`
- Code: `lib/paddle/` · `app/api/paddle/webhook/route.ts` · `app/pools/[pool_id]/upgrade/` ·
  `app/pricing/page.tsx` · `app/refund-policy/page.tsx`
- Migrations: **067** (`pools.tier`, `pool_purchases`) · **075** (cap enforcement) ·
  **144** (lifetime dossier + the index warning) · **146** (member colour) ·
  **147** (avatar build, and the reservation of `avatar_config` for paid cosmetics)

---

**v2 written 2026-09-29.** Player-side measurement run against production the same day; every
built-state claim above was checked against the repo rather than carried over from v1.
