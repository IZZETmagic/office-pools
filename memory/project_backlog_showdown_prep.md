---
name: project-backlog-showdown-prep
description: Phase 3a.pre — Showdown work safe to start before the WC ends. Pure-logic modules, UX design, prototypes, schema diffs on paper.
metadata:
  type: project
---

Phase 3a.pre runs parallel to WC live ops (Jun–Jul 2026). Goal: pull pre-WC-friendly Showdown work forward so the Phase 3a sprint (Jul 27 – Aug 14) starts already de-risked. **Same R-11 discipline as 3b.0** — strictly interruptible, WC live ops wins every priority fight. R-12 caps how many items run concurrently with 3b.0.

**Why:** Phase 3a is a tight ~4-week window from WC final to EPL kickoff Aug 15. The deadline is non-negotiable (R-01). Any greenfield work done pre-WC compresses the sprint into integration + polish, which is materially less risky than building from scratch under deadline pressure. Several Phase 3a critical-path items are pure logic or design with zero WC touchpoints — they can be built today.

**How to apply:**

Scope is broken into three buckets by risk profile.

*Pure logic — buildable + unit-testable against synthetic data:*
1. **Pairing engine** — random pairing per gameweek, anti-repeat weighting, three-way duels for odd pool sizes, double-gameweek refresh. Self-contained module. Tests run against synthetic season fixtures.
2. **Duel scoring** — 3-1-0 layered on existing pick accuracy. Pure function + tests.
3. **Banter Cup payout logic** — best H2H record vs eventual champion. Simulate against synthetic seasons; verify edge cases (ties, leader-also-wins-banter).

*Design / prototypes — non-code or zero-deploy-risk:*
4. **Showdown UX design** — pool feed, matchup card with H2H form guide, duel result card, tunnel walk-out reveal, QR pool join. Use Figma; Stitch MCP can scaffold screen variants. Unblocks Phase 3b.1 mobile surfaces, which are explicitly deferred today awaiting UX.
5. **Tunnel walk-out reveal prototype** — 4s MP4 export pipeline, animation timing, WhatsApp share intent. Standalone spike. Stack details: see [[project-backlog-showdown-animations]].
6. **EPL fixtures schema diff** — documented on paper. No migrations applied during WC (R-11).
7. **H2H ledger schema** — append-only ledger spanning seasons; powers last-5 form guide on matchup cards. Document on paper.

*External / vendor latency — value comes from starting early:*
8. **EPL data provider evaluation** — api-football vs Sportradar / Sportmonks / OpticOdds, costed. Feeds R-04 multi-sport feed decision.
9. **Play Store account setup** — already in 3b.0 scope; reinforce here for R-05 review buffer.

*Notification ecosystem — copy + schema (no infra):*
10. **Notification copy + deep-link schema design** — final push/email copy for all 7 Showdown triggers, deep-link URI scheme, draft Resend email templates. See [[project-backlog-showdown-notifications]]. WC-safe — no cron wiring, no new APIs, no schema changes.

Hard rules (R-11 applied here):
- WC ops always wins. Drop the prep work immediately if support / bugs / live issues need attention.
- No WC schema changes; no new WC-visible APIs.
- Anything requiring production deploy waits for Phase 3a.

Out of scope: real fixtures ingestion, real pairings, real duel scoring against prod data — all Phase 3a.

Highest-leverage starting subset (per R-12 mitigation): **pairing engine → Showdown UX → tunnel reveal prototype → notification copy + deep-link schema**. These four unblock the most downstream work for the least concurrent bandwidth. Notification copy in particular is pure writing work that costs zero risk and saves ~1 day from the Phase 3a sprint.

Related: [[project-backlog-showdown]] (the full Showdown mode spec), [[project-backlog-showdown-animations]] (visualization/animation stack), [[project-backlog-showdown-notifications]] (push + email + deep links — load-bearing for virality), [[project-backlog-expo-migration]] (Phase 3b.0 mobile foundation running in parallel).
