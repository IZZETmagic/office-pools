# Office Pools — Marketing Runway

**Status:** v0.1 draft (Jun 2026). Marketing plan for the FIFA World Cup 2026 → EPL Aug 2026 → multi-sport horizon. Owner: Ryan Sousa.

For roadmap and engineering sequencing, see `ROADMAP.md`. For pricing tiers and revenue model, see `MONETIZATION.md`. For Showdown product spec, see `memory/project_backlog_showdown.md`.

---

## How to use this doc

- **§1 Principles** — what this plan is and isn't doing.
- **§2 Timeline anchors** — the dates that bound every phase.
- **§3 Audience segments** — who we're marketing to.
- **§4 Channels** — where we reach them.
- **§5 Phases (M1 → M5)** — the actual runway, phase by phase.
- **§6 Asset checklist** — what needs to be designed/written/shot.
- **§7 KPIs** — what we measure to know it's working.
- **§8 Risks & dependencies** — the marketing-specific constraints.
- **§9 Open questions** — unresolved calls.

When the marketing plan changes materially (campaign added, channel dropped, asset shipped, KPI target moved), update this doc.

---

# 1. Principles

1. **Virality before paid.** WhatsApp / iMessage / group-chat sharing is the wedge. Every product moment (pool join, reveal, result, recap, badge) should be one-tap shareable with a rich preview. Paid acquisition is a last resort, not a habit.
2. **Tournaments are marketing moments, not campaigns.** Don't try to keep one campaign running across seasons — each tournament gets its own micro-launch. Re-use templates, not creative.
3. **Two distinct audiences, one funnel.** (a) Existing WC users we already have. (b) Net-new EPL audiences we don't. The wind-down handles (a); the Aug 15 launch handles (b). Same product, different copy.
4. **Pool admins are the multiplier.** One paying admin = 5–30 free players. Every dollar of acquisition spend should be measured per-admin-acquired, not per-user.
5. **Bars are the leverage point.** Pool Ultra ($500/tournament) earns more than 25 Pool Plus pools combined. One hand-sold venue cohort beats any social campaign for ROI through 2026.
6. **No marketing of features that don't exist.** Don't run an EPL waitlist landing page before the Showdown engineering scope is locked (Phase 2 of ROADMAP). Pre-register only when the build is committed.
7. **Founder voice carries the brand.** Through 2026, "Office Pools" is Ryan's voice on Twitter / LinkedIn / WhatsApp. No anonymous brand account. Buy authenticity now, layer brand polish later.
8. **Earn the EPL launch with a great WC.** The single highest-ROI marketing activity through Jul 19 is shipping a flawless WC product. Word-of-mouth from a clean tournament beats any teaser campaign.

---

# 2. Timeline anchors

| Date | Event | Marketing implication |
| --- | --- | --- |
| Jun 6, 2026 | Today | Pre-tournament window; only ~5 days left before WC opens |
| Jun 11, 2026 | WC group stage opens | M1 begins — earned-media mode |
| Jul 19, 2026 | WC final | Inflection point — engagement peaks, then disperses |
| Jul 20–Aug 14, 2026 | Wind down + Showdown teaser | M2 — capture attention while it's hot, pre-register for EPL |
| Aug 15, 2026 | EPL 2026/27 kickoff | **Hard deadline.** M3 begins — Showdown launch |
| Aug 15 – Sep 30, 2026 | First 6 EPL gameweeks | M3 — establish the product loop, harvest first reveals |
| ~Nov 2026 | EPL holiday fixture spike + Android GA | M4 — second-wind acquisition push |
| Q1 2027+ | Multi-sport selection (NFL 2027? Euros 2028?) | M5 — multi-sport positioning |

The ~4-week gap between WC final and EPL kickoff is the entire bridge. Miss it and the WC user base disperses for a year.

---

# 3. Audience segments

The funnel runs admin-first because admins bring players for free. Player-direct marketing is reserved for Pool Pro subscription (Vector 2 in `MONETIZATION.md`), which is a Phase 3b.2 problem.

| Segment | Approx. size (Jun 2026) | Acquisition cost | Marketing job for this runway |
| --- | --- | --- | --- |
| Active WC pool admins | ~15 (per MONETIZATION 2026 WC regression) | Earned (already have them) | Retain → convert to EPL Showdown admins |
| Active WC players | TBD (extrapolate from admin × avg 10 members) | Earned | Convert to Showdown players in same pools |
| Lapsed pre-WC users | Unknown — pull from Supabase before M2 | Cheap (one email) | Re-engagement; flag for EPL pre-register |
| Net-new EPL admins (office) | 0 today | Medium — personal network + content | Acquisition via founder content + admin referral |
| Net-new EPL admins (friend group) | 0 today | Low — WhatsApp share + QR | Acquisition via existing-admin invite |
| Bar / venue admins (Pool Ultra) | 0 today | High touch, high LTV | Hand-sold cohort during M2 + M3 |
| Mobile-only (Android) audience | 0 today | Gated on Phase 3b.1 Android GA | Acquire only after Android GA (~Nov 2026) |

Audience size estimates need an explicit count pull before M2 — see §9 open questions.

---

# 4. Channels

Ranked by leverage given the product's wedge. Channels marked "exists" are already built; "build" means asset work required during this runway.

| Channel | Status | Where it lives | Cost | Priority |
| --- | --- | --- | --- | --- |
| WhatsApp / iMessage share intent | exists | Pool detail share button + Showdown reveal MP4 | Free | **Highest** |
| Open Graph link previews | exists (audit needed) | Every public pool / join / share URL | Free | **Highest** |
| QR pool-join flow | exists | Pool admin invite screen → print pack | Free | High (paired with bar pack) |
| Founder Twitter / X | exists | Personal account | Time only | High (M1 + M3) |
| Founder LinkedIn | exists | Personal account | Time only | Medium (office angle) |
| Tournament-edition email | exists (Resend) | Existing opt-in list | Resend cost | High (M2 + M3) |
| Showdown explainer video / Loom | build | YouTube unlisted + landing page embed | $0–500 | High (M2) |
| Showdown landing page | build | officepools.com/showdown | 1–2 days dev | High (M2) |
| App Store / Play Store screenshots + listing | build | Stores | Time + ~$200 design | High (M3 / M4) |
| Bar marketing pack | build (gated on Pool Ultra venue) | Auto-stamped print pack — see MONETIZATION | $1–2K design (MVP 5 templates) | High for first venue, defer for self-serve |
| Local press / sports blog outreach | build | Hand-rolled | Time only | Medium (M3 only) |
| Podcast intros / sponsor reads | not pursued in this runway | — | — | Defer |
| Paid social ads | not pursued in this runway | — | — | Defer until M4 at earliest |
| Influencer / creator marketing | not pursued in this runway | — | — | Defer to M5 |

The "Highest" / "High" channels are doing 95% of the work. Paid is parked.

---

# 5. The runway, phase by phase

Each phase is bounded by a roadmap milestone (see ROADMAP.md §1).

## Phase M1 — WC live ops (Jun 11 – Jul 19, 2026)

Goal: **Earn the EPL launch by serving the WC product brilliantly.** Marketing is in the background; the product is the marketing.

| Activity | Cadence | Owner | Cost |
| --- | --- | --- | --- |
| Pre-tournament announcement post (Twitter + LinkedIn) | Once, Jun 7–10 | Ryan | 1 hr |
| Match-day founder moment-grab post | Per match-day (up to 4/day in group stage) | Ryan | ≤15 min/day |
| Match-day recap email (existing cron, currently disabled — re-enable for WC live; rewrite scoped post-WC per `project_backlog_emails.md`) | Per match day | Cron | Build cost in WC live ops |
| Pool-share prompts inside the app | Always-on | Surfaced in Pool detail | None — already built |
| Encourage admins to share join links via WhatsApp | Passive — exists | App | None |
| **No** paid ads, no press outreach, no Showdown teasing | — | — | — |
| Founder energy budget on marketing | ≤10% | Ryan | — |

Output for M2: a **moments archive** — screenshot every memorable banter exchange, badge-flex, pool-leader-swap, big upset. This becomes the raw material for Showdown teaser content.

Anti-goal: do not pre-announce Showdown during the WC. Risks user attention bleed and risks shipping commitments not yet validated by Phase 2 (ROADMAP §1).

## Phase M2 — Wind down + Showdown teaser (Jul 20 – Aug 14, 2026)

Goal: **Convert WC engagement into pre-registered EPL Showdown interest while the WC is still fresh in everyone's WhatsApp.** Bar venue cohort begins parallel.

Sequenced week by week — this phase is tight.

### Week 1 (Jul 20–26)

- **Day 0 (Jul 20):** post-tournament recap email blast to all WC users. Includes total predictions, total banter messages, top moments. Closes with: "We're doing EPL next. Reply if you want first access."
- **Day 0:** Twitter / LinkedIn post — founder reflection on the WC, what's next.
- **Day 1–7:** post-tournament feedback survey (already in ROADMAP Phase 1) goes out. Marketing role: question 1 = "Would you run another pool for the EPL?"; question 2 = "Would you pay $19 to do it?"

### Week 2 (Jul 27 – Aug 2)

- **Showdown landing page goes live** at `officepools.com/showdown`. Email-capture pre-registration only. Promise: pool admins who pre-register get **(a)** first-week access on Aug 15 and **(b)** a free Pool Plus upgrade for the EPL season. Build cost: 1–2 days.
- **Day 7:** founder Loom — 90-second explainer on what Showdown is and why it's not fantasy football. Embedded on landing page + posted to Twitter / LinkedIn.
- **Bar Ultra outreach begins:** cold DM / email to 10 sports bars in target geographies about a Pool Ultra pilot. Launch-cohort price: **$250 / season** instead of $500 (validates the model with real venues before generalizing — RM-02 mitigation).

### Week 3 (Aug 3–9)

- **Targeted one-to-one DMs** to the top 10 highest-engagement WC pool admins ("you ran a great WC pool — want to run one for EPL?"). Personal, not blast. Goal: 5/10 conversion to pre-registration.
- **Showdown tunnel walk-out reveal animation** mockup published as a Twitter video — the virality wedge in preview form. Even pre-launch, the animation is shareable.
- Bar Ultra: aim for **2 verbal commits** by end of week.

### Week 4 (Aug 10–14)

- **Pre-launch email** to all pre-registered admins: "Showdown launches Aug 15 — here's what your pool will look like." Includes a one-pager attachment.
- **App Store / Play Store screenshot refresh** if Phase 3b.1 mobile surfaces are ready in time; otherwise web only.
- **Office-angle LinkedIn post** from Ryan — the "$5 office pool / $500 bar venue" framing. Targets office-pool admins specifically.
- Bar Ultra: **paid commitment for first 1 venue** is the M2 success bar.

### M2 success bar

- ≥30 pre-registered EPL admins
- ≥1 paying Pool Ultra venue committed for EPL kickoff
- ≥3 founder content pieces published with >100 impressions each
- Feedback survey closes with ≥40% admin response rate (per R-03)

If the survey response is low, M3 acquisition push gets reweighted toward the bar cohort.

## Phase M3 — EPL Showdown launch (Aug 15 – Sep 30, 2026)

Goal: **Hard launch.** First 6 gameweeks are the make-or-break engagement window for Showdown's H2H loop.

### Launch day (Aug 15)

- **Showdown is live.** Pre-registered admins get first-touch email with their pool setup link.
- **Founder launch post** — Twitter thread, LinkedIn post, personal WhatsApp groups. Hits at 9am ET.
- **Press push (modest):** outreach to 5 hand-picked outlets — local sports blogs in target geographies, one office-culture / SaaS publication. Pitch: "the WhatsApp-native pick'em pool for the EPL." No press release; one-to-one emails.
- **First Pool Ultra venue goes live** in the bar's actual venue — TV leaderboard, table tents, QR posters all stamped. Take photos. Use as case-study material immediately.

### Gameweeks 1–6 (Aug 15 – Sep 30)

- **Monday reveal posts.** Every Monday at 9am, the tunnel walk-out reveal animation is posted to Twitter as the founder's content. "Here are this week's duels in [Pool X]" with a sample MP4.
- **Sunday result cards.** Founder grabs the funniest banter from results, posts as Twitter / LinkedIn content.
- **Bar Ultra activation.** Photos of the in-bar leaderboard / QR poster / table tents → social. Cross-promote with the bar's own social.
- **Pool admin referral nudge:** in-app prompt at gameweek 3 — "your pool is having fun, who else should run one?" with one-tap WhatsApp share intent.
- **First case-study artifact:** a short founder write-up (LinkedIn long-form or blog) telling the story of a single Showdown pool through the first 4 gameweeks. Real names if permission given, otherwise anonymized.

### M3 success bar

- ≥50 active EPL Showdown pools (admin signed up + ≥3 picks submitted in first 2 gameweeks)
- ≥1 Pool Ultra venue active with patron foot traffic (measured by QR scans)
- WhatsApp share intent triggered ≥5× per pool per week (measured by event log)
- Founder content reaches ≥1K cumulative impressions in M3

## Phase M4 — Mid-season engagement spike (Oct – Nov 2026)

Goal: **Capitalize on the EPL holiday fixture run + Android GA.** Second-wind acquisition push.

- **Android launch marketing.** Coordinated push when Phase 3b.1 ships Android GA (~Nov 2026). Play Store listing, founder content, email blast to any users who flagged Android in the survey or pre-registration.
- **Holiday fixture push** (Boxing Day, NYD). Double-gameweek Showdown moments become high-share-rate content. Plan one founder content piece per holiday fixture day.
- **Bar Ultra v2.** Use M3 case-study and photos to onboard cohort 2 of bars — target 5 paying venues by end of December.
- **First Pool Pro tease.** If cosmetic marketplace (Vector 1) launches in Phase 3b.1, run it as a holiday push — themed Christmas / NYE cosmetics. Validates "will players pay" question before subscription infra ships in Phase 3b.2.
- **Mid-season recap email** to all EPL admins — "your pool through GW15." Includes "invite a friend" CTA pointing to a new EPL pool creation flow.

### M4 success bar

- Android GA hits ≥10% of total weekly active by Nov 30
- ≥5 paying Pool Ultra venues active
- Cosmetic marketplace conversion ≥2% (gates Pool Pro investment per RM-03)
- Net 50% growth in active pools vs end of M3

## Phase M5 — Multi-sport horizon (Q4 2026 onward)

Goal: **Position for the next-sport decision** without overcommitting before the multi-sport foundation (ROADMAP Phase 3c) is ready.

This phase is intentionally light on commitments — it's a placeholder so the marketing team (Ryan) doesn't lose the thread between EPL season-end (May 2027) and whatever ships next.

- **Next-sport survey.** Run in Q1 2027 to settle: NFL 2027 (Sep 2027 kickoff) vs Euros 2028 (Jun 2028 kickoff) vs a dark horse (NBA, March Madness, F1).
- **EPL 2027/28 retention push** (Aug 2027). Returning admins get a "house team" badge.
- **Cross-sport email cadence design** kicks in with ROADMAP Phase 3c.4. Until then, every new competition is a discrete marketing moment.
- **Per-competition branding** (ROADMAP Phase 3c.6) becomes the marketing layer for differentiation.

M5 is the moment to revisit principle #2 (tournaments are marketing moments) — if multi-sport is live by then, this principle may need to evolve into a sport-pass or season-pass framing.

---

# 6. Asset checklist

Tracked against the phase that needs it.

| Asset | Status | Needed by | Owner | Notes |
| --- | --- | --- | --- | --- |
| WC pre-launch Twitter post | not started | Jun 10 | Ryan | M1 |
| Match-day recap email template | exists, needs M1 reuse | Jun 11 | — | Rewrite is `project_backlog_emails.md` work |
| WC moments archive (rolling) | not started | Jul 19 | Ryan | Input for M2 |
| Post-tournament recap email | not started | Jul 20 | Ryan | M2 — re-use match-day recap structure |
| Showdown landing page | not started | Jul 27 | Eng | M2 — 1–2 days dev |
| Showdown explainer Loom (90s) | not started | Jul 27 | Ryan | M2 — record once |
| Tunnel walk-out reveal MP4 preview | not started | Aug 3 | Design + Eng | M2 social asset |
| EPL pool one-pager (PDF) | not started | Aug 10 | Ryan | M2 — pre-launch email attachment |
| App Store screenshots for Showdown | not started | Aug 15 (if Expo iOS GA) or Nov 2026 (Android GA) | Design | M3 / M4 |
| Press pitch one-liner + 5 outlet list | not started | Aug 10 | Ryan | M3 launch |
| Bar Pool Ultra cold-pitch email template | not started | Jul 27 | Ryan | M2 — see MONETIZATION marketing pack |
| Bar marketing pack — MVP 5 templates | not started | First venue signup | Freelance designer | ~$1–2K per MONETIZATION RM-05 |
| First Pool Ultra venue photo set | not started | Aug 15 onwards | Ryan + venue | M3 case-study material |
| Case-study LinkedIn / blog write-up (gameweek 4) | not started | ~Sep 15 | Ryan | M3 |
| Mid-season recap email | not started | ~Dec 1 | Ryan | M4 |
| Android launch announcement content | not started | Phase 3b.1 ship date | Ryan | M4 |
| Holiday fixture social pack | not started | Dec 20 | Ryan | M4 |

---

# 7. KPIs

Measured against the phase, not against a global target. Quarterly retros against this table.

| KPI | M1 target | M2 target | M3 target | M4 target |
| --- | --- | --- | --- | --- |
| Active pools | maintain WC count | — | 50 EPL Showdown | +50% vs M3 end |
| Paying admins | n/a | — | 20 (any tier) | 50 |
| Pool Ultra venues paying | 0 | 1 committed | 1 live | 5 live |
| Pre-registered EPL admins | n/a | 30 | converted | — |
| WhatsApp share intent fires / pool / week | track only | track only | ≥5 | ≥7 |
| Founder content impressions (cumulative) | n/a | 1K | 5K | 15K |
| Feedback survey response rate | n/a | ≥40% admin | n/a | n/a |
| Email open rate (recap blasts) | ≥35% | ≥35% | ≥30% | ≥25% |
| Cosmetic marketplace paying conversion | n/a | n/a | n/a | ≥2% (gate for Pool Pro per RM-03) |

Targets above M1/M2 are aspirational starting points — recalibrate after M2 actuals land.

---

# 8. Risks & dependencies

Marketing-specific. Engineering and product risks are in `ROADMAP.md` §4; pricing risks are in `MONETIZATION.md` §Risks.

| # | Risk / dependency | Surface | Mitigation |
| --- | --- | --- | --- |
| MR-01 | WC live ops eats all of Ryan's attention; M1 marketing slips entirely | M1 | M1 is intentionally light — ≤10% of energy budget. Even if it slips, M2 still works. |
| MR-02 | Showdown engineering scope slips past Aug 15; landing page promised something the product can't deliver on Day 1 | M2 → M3 | Lock landing page copy to whatever's actually committed at end of Phase 2 (ROADMAP). Don't promise features that aren't in the Phase 3a scope. |
| MR-03 | Pool Ultra venue cohort doesn't close — no paying bar by Aug 15 | M2 | Pivot Pool Ultra outreach to a "Phase 3b.2 launch" instead of "Aug 15 launch." Don't fake-launch. |
| MR-04 | Pre-registration list is small (≤10) → M3 hard launch lacks an initial cohort | M2 → M3 | Backstop by re-engaging lapsed pre-WC users via email blast in week 4 of M2. Treat pre-WC users as a recoverable audience. |
| MR-05 | Founder content burnout (1 post/match-day is unsustainable across a 5-week tournament) | M1 | Define minimum cadence as 1/match-day on key matches only (group-stage openers, last-day-of-group, all knockouts). Skip filler match-days. |
| MR-06 | WhatsApp share intent doesn't fire on iOS web (intent only works in-app or in mobile browsers with WhatsApp installed) | All phases | Verify share intent flow on iOS Safari + Chrome before relying on it as a KPI. Audit during M2 week 1. |
| MR-07 | Open Graph previews break on key share URLs (join links, reveal links, recap emails) | All phases | Audit OG metadata on all shared URLs during M2 week 1. Use Twitter card validator + LinkedIn post inspector. |
| MR-08 | EPL fixture data feed delay → Aug 15 launch slips on the data side | M3 | Track api-football EPL feed availability as a critical M3 dependency. Confirm by mid-M2. |
| MR-09 | Press pitch lands flat — no outlet picks up the launch | M3 | Press is a stretch goal, not a critical path. M3 success bar doesn't depend on it. |
| MR-10 | Bar Ultra hand-rolled cohort is too time-consuming during M3 launch crunch | M3 | Cap cohort to 1–2 venues for M3. Expand to 5 in M4 when launch firefighting eases. |
| MR-11 | Android GA timing depends on ROADMAP Phase 3b.1 — slipping past Nov 2026 deletes the M4 second-wind story | M4 | M4 success bar is still achievable on iOS-only if needed. Recalibrate KPI if Android slips. |
| MR-12 | Cosmetic marketplace doesn't ship in M4 → no "will players pay" validation before subscription infra | M4 → M5 | Gate Pool Pro engineering investment on Vector 1 actuals per MONETIZATION RM-03. Pushing Pool Pro to Q2 2027 is acceptable if Vector 1 isn't live by Dec 2026. |

---

# 9. Open questions

Resolve before the phase that needs the answer.

- **(M1)** What is the actual count of WC users (admin + player) as of Jun 6? Need exact numbers before M2 audience sizing — pull from Supabase.
- **(M1)** Should the match-day recap email be re-enabled before Jun 11 for WC live ops, or does it stay disabled until the rewrite ships post-WC? See `memory/project_backlog_emails.md`.
- **(M2)** Pre-registration landing page — does it collect just email, or also "are you bringing your WC pool members"? The latter is higher-signal but reduces conversion.
- **(M2)** Pool Ultra launch-cohort pricing — $250 or $500 for first 1–2 bars? $250 validates faster; $500 protects price anchor.
- **(M2)** Showdown explainer Loom — founder-only, or include a 2-pool real-data simulation visual? Visual is higher-effort but better wedge content.
- **(M2 → M3)** EPL Showdown copy / brand — does it carry the "Office Pools" master brand, or does Showdown get a sub-brand of its own (e.g. "Showdown by Office Pools")? Sub-brand makes the H2H product more distinct; master brand consolidates equity.
- **(M3)** Press pitch geographic targeting — US-only, UK-only, or both? UK has stronger EPL hook; US is the user base.
- **(M3)** Should the first case-study use real pool names + photos with permission, or fully anonymized? Real is higher-impact; anonymized is friction-free.
- **(M4)** Holiday fixture social pack — Christmas / NYE only, or also Halloween (Oct 31 sits between EPL gameweeks)? Halloween is a creative wedge but off-theme for sport.
- **(M5)** Next-sport survey timing — Q1 2027 (early enough to influence ROADMAP Phase 3c) or Q2 2027 (closer to NFL 2027 kickoff signal)?

---

## Cross-references

- `ROADMAP.md` §1 Phases 1–3c, §4 R-01 (Aug 15 deadline), R-03 (survey response rate), R-05 (store review latency), R-11 (WC live ops always wins)
- `MONETIZATION.md` Pool tier definitions, Pool Ultra marketing pack, RM-02 (bar adoption), RM-03 (cosmetic conversion gate), 2026 WC regression baseline
- `memory/project_backlog_showdown.md` — Showdown product spec; the launch this runway is building toward
- `memory/project_backlog_feedback.md` — Phase 2 survey design; marketing's primary signal source
- `memory/project_backlog_emails.md` — match-day recap email rewrite; gates much of the M1/M2 email cadence
- `memory/project_backlog_expo_migration.md` — Android GA gating M4

---

**Status:** v0.1, Jun 2026. Owner: Ryan Sousa. Update this doc as the runway is walked.

**Recent revisions:**
- v0.1 (Jun 2026) — Initial draft. Skeleton for WC → EPL Showdown → multi-sport horizon. Phases M1–M5, asset checklist, KPIs, risks, open questions.
