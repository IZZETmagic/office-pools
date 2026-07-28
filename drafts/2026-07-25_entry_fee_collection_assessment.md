# Entry-fee collection for admins — legality & feasibility assessment

**Date:** 2026-07-25
**Question:** Can we give pool admins a way to collect entry fees from members, with **zero money flowing through the app** — the app only helps members send money directly to the admin?
**Author:** Claude (research + design). **Not legal advice** — §7 lists what needs a lawyer's sign-off.

---

## TL;DR

**Feasible — and we've already built ~70% of it.** But the binding constraint is *not* the one you'd expect.

1. **Money-transmission law is a non-issue** if we never touch funds. That part of the instinct is exactly right and it's the single biggest risk-reducer available.
2. **Gambling law is a real but manageable risk**, and it turns almost entirely on *pool structure* (no rake, 100% to winners, known participants) — not on how the payment is sent. We can enforce most of those conditions in product.
3. **The actual blocker is the payment rails themselves.** Venmo, PayPal, Cash App and Zelle *all* ban entry-fee-and-prize transactions in their AUPs. PayPal's prohibited list literally includes **"organized forums that facilitate person-to-person betting"** — which is a fair description of a deep-link-to-pay feature. This isn't theoretical: pool organisers have had funds frozen, and there's been class-action litigation over it.
4. **Recommendation: ship the "handle + instructions" version (Option A), not the "deep link with prefilled amount and memo" version (Option B).** Option B buys maybe 15 seconds of member convenience and, in exchange, moves us from *describing* a payment to *constructing* one — which is the line that matters for both PayPal's AUP and Apple's Guideline 5.3.

---

## 1. What already exists

More than I expected. The ledger half is done:

| Piece | Where | Status |
|---|---|---|
| `pools.entry_fee`, `pools.entry_fee_currency` | [types.ts:20](app/pools/[pool_id]/types.ts:20) | ✅ |
| `pool_entries.fee_paid`, `fee_paid_at` | [FeesTab.tsx:99](app/pools/[pool_id]/admin/FeesTab.tsx:99) | ✅ |
| `pool_members.entry_fee_paid` (legacy per-member flag) | [types.ts:38](app/pools/[pool_id]/types.ts:38) | ⚠️ superseded by per-entry |
| Admin Fees tab — mark paid/unpaid, collection rate, totals | [FeesTab.tsx](app/pools/[pool_id]/admin/FeesTab.tsx) | ✅ |
| Member-facing fee + prize-pool display | [PoolInfoTab.tsx:142](app/pools/[pool_id]/PoolInfoTab.tsx:142) | ✅ |
| Fee setup in admin settings | [SettingsTab.tsx:659](app/pools/[pool_id]/admin/SettingsTab.tsx:659) | ✅ |
| ToS §5 "Entry Fees & Prizes" — we don't collect/hold/process/disburse | [app/terms/page.tsx:106](app/terms/page.tsx:106) | ✅ strong |
| FAQ — fees are off-platform via Venmo/PayPal/cash | [faqData.ts:237](app/faq/faqData.ts:237) | ✅ |

**The ToS language is already the correct posture** and should not be weakened:

> "Sport Pool does not collect, hold, process, or disburse money. We are not a payment processor, escrow service, or prize sponsor." — ToS §5

**What's missing** is only the *last mile*: the member has no idea **where to send the money**. Today an admin has to tell them in Banter, or by text. That's the whole gap.

Also worth noting: [PoolInfoTab.tsx:148](app/pools/[pool_id]/PoolInfoTab.tsx:148) already computes `Total prize pool = entry_fee × total_entries` — i.e. the UI already asserts **100% of fees go to the prize pool, no rake**. That is a compliance-*positive* signal and should be made explicit rather than incidental.

---

## 2. Legal analysis

### 2.1 The test

Gambling in nearly every US jurisdiction = **consideration + chance + prize**. An entry-fee pick'em pool with a cash prize has consideration and prize. The fight is over *chance*:

- **"Predominant purpose" states** (majority) ask whether skill outweighs chance. A season-long, multi-match accumulator pick'em has a decent skill argument.
- **"Any chance" states** (a minority, e.g. traditionally Arizona, Illinois, Tennessee) say any material chance element makes it gambling — a much harder test to pass.

Format matters here, and it cuts against us in one place: **survivor/single-elimination-style formats are the weakest** on skill, because a single match outcome decides the result. Our `full_tournament` and `progressive` accumulator modes are the strongest.

### 2.2 Federal

| Statute | Applies to us? |
|---|---|
| **UIGEA (2006)** | Targets *businesses accepting payment* for unlawful internet gambling. **If we never accept payment, the core prohibition doesn't reach us.** Its famous fantasy-sports carve-out requires prizes fixed in advance, outcomes from accumulated stats across multiple events, and not turning on a single game/athlete — our accumulator modes plausibly fit; a survivor mode would not. Note the carve-out only exempts from *UIGEA*; it doesn't legalise anything under state law. |
| **Wire Act (1961)** | Aimed at those "engaged in the business of betting or wagering" transmitting bets interstate. We take no bets and no rake, so we're not in that business. |
| **IGBA (1955)** | Requires an illegal gambling *business* — 5+ people, 30 days or $2k/day. Aimed at operators, not a free scoreboard. |

**Bottom line: federal exposure is low, and it's low specifically *because* no money flows through the app.** That design constraint is doing enormous work. Do not relax it.

### 2.3 State — the social-gambling exemption

Most states carve out "social gambling." The conditions are remarkably consistent across states, and **all of them are things we can enforce or attest in product**:

1. **No one profits from organising.** The admin takes no cut, no fee, no rake.
2. **The organiser participates on equal terms** with everyone else.
3. **100% of the pot goes to participants** as prizes.
4. **Participants have a bona fide social relationship** outside the gambling (a real office, a real friend group) — argues for keeping private pools private.
5. **Stake limits** in some states.

A handful of states have no meaningful social exemption at all. Public sources disagree on the exact list (I found contradictory lists and won't repeat one as fact) — **this specific question needs counsel**, and it's the main thing worth paying for.

### 2.4 Bermuda (operator jurisdiction)

Betting is regulated under the **Betting Act 1975** as modernised by the **Betting Act 2021**, with the **Bermuda Gaming Commission** and the Betting Licensing Authority. Licensed pool-betting agents pay a **20% betting duty**. The relevant question is whether an unlicensed platform that facilitates but never handles pool stakes falls inside the licensing perimeter — **this is a Bermuda-counsel question**, and it's the second thing worth paying for. The answer likely turns on the same "do you handle stakes / take a cut" distinction.

### 2.5 Does "no money through the app" fully insulate us?

**No — but it's still the right call.** It near-eliminates:

- Money-transmitter / MSB licensing (state-by-state, ruinously expensive — this alone justifies the constraint)
- KYC/AML obligations
- Escrow and custody liability
- UIGEA's core "accepting payment" prohibition
- Chargeback and payment-fraud exposure

It does **not** eliminate a possible *facilitation* or *aiding* theory. But without money handling and without a rake, we look like a scoreboard, not a book. **Our commercial model — free product, no rake — is our best legal asset.** Any future monetisation that takes a percentage of pools would blow this up entirely and should be treated as a different legal product.

---

## 3. The thing that will actually bite us: payment-rail AUPs

This is the finding that changed my recommendation.

**Every major US P2P rail prohibits exactly this transaction.**

- **PayPal** prohibits "Games of chance and games of skill — *includes any activity with an entry fee and a prize*", "Person-to-person betting", "the purchase or sale of any opportunity to participate in a raffle, drawing, sweepstake, **pool**", and — most pointedly — **"Organized forums that facilitate person-to-person betting."**
- **Venmo** (PayPal-owned, same posture): payments for "gambling, gaming or any form of activities with an entry fee and a prize" are prohibited/ineligible.
- **Cash App**: prohibits activity "where an individual risks anything of value to get something of value based on a certain outcome," absent an approved merchant.
- **Zelle**: same posture.

And it is enforced. Private league and pool organisers have had entry-fee funds **frozen or seized**, which produced a class action against PayPal fronted by Chris Moneymaker. Venmo runs memo lines against keyword databases, freezes accounts, and has **no formal appeals process** — a permanently deactivated account is a live outcome.

**Product consequence:** if we ship a button that opens Venmo with `amount=25` and `note="World Cup pool entry"`, we are (a) authoring the exact string that gets an admin's account frozen, and (b) making ourselves look a lot like PayPal's "organized forum that facilitates person-to-person betting." We'd be manufacturing the evidence against our own users.

**This is a stronger argument for the conservative design than anything in the gambling analysis.** A prosecutor is unlikely; a frozen Venmo account for a beloved admin is a Tuesday.

---

## 4. App Store exposure

Mobile is testers-only today, but this matters the moment we ship publicly.

**Guideline 5.3.3** provides that apps may not use IAP for real-money gaming credit and **"may not enable people to purchase lottery or raffle tickets or initiate fund transfers in the app."**

Reading:
- Displaying a payment handle as text ≈ information. Defensible.
- A tappable link that launches Venmo with a prefilled amount ≈ **"initiate fund transfers in the app."** That's the phrase, close to verbatim.

**Guideline 5.3.4** additionally requires real-money-gaming apps to hold licences in every location of use, be geo-restricted, and be free. We do not want to be classified into 5.3.4. Also, per 5.3, contests must be sponsored by the developer with official rules in-app and a clear statement that Apple is not a sponsor.

Apple review is inconsistent and an escalation here is expensive. **Option B risks the entire mobile app over a convenience feature.**

---

## 5. Options

| | **A — Payment instructions (text)** | **B — Deep links, prefilled** | **C — Regulated/licensed** |
|---|---|---|---|
| Admin enters | Free-text instructions + handle | Structured handle per provider | Bank/KYC onboarding |
| Member sees | Instructions + copy button | "Pay $25" → opens Venmo | In-app checkout |
| App constructs a payment? | **No** | **Yes** | Yes |
| Money touches us? | No | No | Yes |
| Rail-AUP risk | Same as a text message | **We author the flagged memo** | Handled via licensed processor |
| App Store 5.3 risk | Low | **"Initiate fund transfers"** | 5.3.4 — licences, geo-fence |
| Effort | ~1–2 days | ~3–4 days | Months + counsel + licensing |
| Verdict | ✅ **Ship this** | ❌ Bad risk/reward | ❌ Out of scope by your constraint |

---

## 6. Recommended implementation (Option A)

### Schema

```sql
-- migration 026
alter table pools
  add column payment_instructions text,          -- admin-authored, free text
  add column fee_terms_accepted_at timestamptz,  -- admin attestation
  add column fee_terms_accepted_by uuid references users(user_id);

alter table pool_entries
  add column fee_member_reported_at timestamptz; -- "I've sent it" — a claim, not a confirmation

-- length guard so it stays instructions, not a storefront
alter table pools add constraint payment_instructions_len
  check (payment_instructions is null or char_length(payment_instructions) <= 500);
```

### Behaviour

1. **Admin, in [SettingsTab.tsx](app/pools/[pool_id]/admin/SettingsTab.tsx)** — when `entry_fee > 0`, a "How members pay you" textarea. Placeholder: `Venmo @ryan-sousa, or cash to me at the office`. Plain text only.

2. **Render as plain text — deliberately.** Do **not** auto-linkify, do **not** build `venmo://` or `cash.app/$x` URLs, do **not** prefill amount or memo. Offer a **copy-to-clipboard** button on the handle. The app describes the payment; the member constructs it. That distinction is the entire legal design.

3. **Member, in [PoolInfoTab.tsx](app/pools/[pool_id]/PoolInfoTab.tsx)** — an "Entry fee" card showing amount, the admin's instructions, a copy button, a **"I've sent my payment"** button writing `fee_member_reported_at`, and a standing disclaimer:
   > Sport Pool is not involved in this payment. Entry fees and prizes are arranged directly between you and your pool admin.

4. **Admin, in [FeesTab.tsx](app/pools/[pool_id]/admin/FeesTab.tsx)** — surface member-reported entries as a "Reported paid — confirm?" state. The admin's `fee_paid` remains the only source of truth. This kills most of the admin's chasing without the app ever asserting a payment occurred.

5. **Admin attestation**, on first enabling a fee — a blocking checkbox:
   > I confirm that I take no portion of the entry fees, that 100% goes to pool participants as prizes, that I participate on the same terms as everyone else, and that this arrangement is lawful where my members are located.

   Store `fee_terms_accepted_at/by`. Cheap to build; disproportionately valuable if anyone ever asks.

6. **Make the no-rake guarantee explicit.** [PoolInfoTab.tsx:148](app/pools/[pool_id]/PoolInfoTab.tsx:148) already renders `entry_fee × entries` as the prize pool — label it *"100% of entry fees go to the prize pool. Sport Pool takes no cut."* This is true, it's a selling point, and it's the fact that best supports the social-gambling exemption.

7. **Optional nudge:** reuse the existing push/email infrastructure for an admin-triggered "entry fee reminder." Must contain no amount-prefilled payment link — same rule as everywhere else.

### Explicitly do NOT build

- ❌ `venmo://`, `cash.app`, `paypal.me` deep links with amount or memo prefilled
- ❌ Stripe/PayPal SDK, in-app checkout, escrow, or holding funds
- ❌ Any rake, platform fee, or percentage of pools
- ❌ Auto-generated payment memos referencing pools, entries, or wagering
- ❌ Payout/disbursement tooling — winner payment stays entirely off-platform
- ❌ Making entry fees mandatory or default-on; keep them opt-in per pool

---

## 7. For counsel (the short, cheap brief)

1. Do we sit outside the **Bermuda Betting Act 2021** licensing perimeter as a facilitator that never handles stakes and takes no rake?
2. Which **US states** should we geo-block or warn in for fee-enabled pools — and is a warning sufficient, or is a block required?
3. Is displaying an admin's payment handle materially different from a member texting it? (Our whole design rests on yes.)
4. Does ToS §5 need strengthening now that we surface payment instructions — and do we want an admin-side indemnity?
5. Do we need geo-gating on the **entry-fee feature specifically**, separate from the app as a whole?
6. Any exposure from `prediction_mode = 'bracket_picker'` or a future survivor mode, given they lean less on skill than the accumulator modes?

---

## 8. Verdict

**Possible: yes.** **Advisable: yes, in the conservative form.** The single most important thing is already true — no money flows through the app, and we take no cut. Keep both, ship Option A, get the two Bermuda/US-state questions in front of a lawyer, and leave deep links alone. The 15 seconds they'd save a member is not worth an admin's frozen Venmo account or an App Store 5.3 fight.

---

## Sources

- [PayPal — What gambling activities does PayPal prohibit?](https://www.paypal.com/us/cshelp/article/what-gambling-activities-does-paypal-prohibit-help391)
- [Venmo — US User Agreement](https://venmo.com/legal/us-user-agreement) · [Purchase Protection Eligibility](https://venmo.com/legal/purchase-protection-eligibility) · [Frozen Account](https://help.venmo.com/cs/articles/frozen-account-vhel251)
- [Cash App — Acceptable Use Policy](https://cash.app/legal/us/en-us/acceptable-use-policy)
- [The Lines — PayPal/Venmo fantasy pool funds lawsuit (Moneymaker)](https://www.thelines.com/paypal-lawsuit-fantasy-football-chris-moneymaker-2022/)
- [Apple — Fixing Guideline 5.3 gambling rejections](https://shopapper.com/fix-apple-gambling-app-rejection-guideline-5-3/) · [Apple Developer Forums — 5.3.3](https://developer.apple.com/forums/thread/747996)
- [Congressional Research Service — Daily Fantasy Sports: Legal and Regulatory Issues (R44398)](https://www.congress.gov/crs-product/R44398)
- [Ohio State Moritz Law — US Fantasy Sports Law: Fifteen Years After UIGEA](https://moritzlaw.osu.edu/sites/default/files/2022-06/14.EdelmanHoldenWandt_v83-1_pp117-156.pdf)
- [FordHarrison — 50-State Survey on Social Gambling Laws](https://www.fordharrison.com/files/30476_50%20State%20Survey%20on%20Gambling%20Laws%20March%202015.pdf)
- [ARAG — Are Office Pools Legal?](https://www.araglegal.com/learning-center/using-your-legal-plan/legal-trouble/are-office-pools-legal)
- [National Law Review — Yes, Your March Madness Bracket Is Technically Illegal](https://natlawreview.com/article/yes-your-march-madness-office-bracket-technically-illegal)
- [Bermuda Gaming Commission — Legislation](https://www.bgc.bm/legislation) · [Gov.bm — Betting Duty (Turfs and Pools)](https://www.gov.bm/betting-duty)
