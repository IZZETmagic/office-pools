# SportPool — FIFA World Cup 2026 post-mortem analytics

**Analysis date:** 2026-08-08
**Tournament window:** 2026-06-11 (kickoff) → 2026-07-16 (final)
**Source:** production Supabase `ujthamlehjyubbzxbnes`, direct SQL. Every number below is a live count,
not an estimate.

---

## 0. Read this first — four data caveats

These change how several numbers should be read. They are not nitpicks.

1. **`users.last_login` is broken/partial.** Only 2,361 of 4,811 authenticated users have a value, yet
   4,767 signed terms and 4,042 have a `user_presence` row. It is evidently not written on session
   restore. **Use `user_presence.last_seen_at` for "did they come back", never `last_login`.**
2. **The daily-active numbers are a *write*-activity proxy** (predictions, messages, round submissions,
   reactions). They cannot see the dominant behaviour — opening the app to look at the leaderboard.
   Treat them as a floor, and note they spike on round-open days because that is when writes happen.
3. **The `push_*_sent` tables are claim ledgers, not delivery receipts.** `lib/push/time-based.ts`
   inserts the dedup row *before* calling `sendPushToUser`, which returns `{sent: 0}` when the user has
   no token. See §7 — this matters a lot.
4. **One entry carries a `99,999,999` admin point adjustment** (`entry_id f2f0f2c7…`, reason `"WINNER"`,
   pool "🐐Darey - Fifa Worldcup 26⚽"). It is a legitimate admin action, not a bug, but it destroys any
   mean over `scored_total_points`. **All scoring figures below exclude it.**

---

## 1. Headline volume

| Metric | Count |
|---|---:|
| Registered users | **4,827** |
| Pools created | **623** |
| Pool memberships | **4,803** |
| Entries | **4,979** |
| Entries submitted | 4,249 (85.3%) |
| Match predictions | **287,701** |
| Group-standing predictions | 40,632 |
| Bracket-picker knockout picks | 28,335 |
| Special (podium/top-scorer) predictions | 3,386 |
| **Total prediction rows** | **~360,054** |
| Banter messages | **4,628** |
| Message reactions | 219 |
| Badge unlocks | 18,575 (3,059 users, 14 badge types) |
| Scored match rows | 286,978 |
| Bonus score rows | 139,677 |
| Matches | 104 (100% completed) |

First user 2026-02-10 · first pool 2026-03-04 · last signup 2026-07-21.

---

## 2. Growth — everything happened in two weeks

New signups / pools / members by week:

| Week of | New users | New pools | New members | Messages |
|---|---:|---:|---:|---:|
| 2026-05-04 | 75 | 12 | 60 | 12 |
| 2026-05-11 | 150 | 43 | 148 | 93 |
| 2026-05-18 | 191 | 42 | 184 | 110 |
| 2026-05-25 | 382 | 73 | 366 | 97 |
| **2026-06-01** | **1,315** | **156** | **1,271** | 296 |
| **2026-06-08** | **2,344** | **151** | **2,350** | **1,618** |
| 2026-06-15 | 61 | 9 | 60 | 837 |
| 2026-06-22 | 66 | 29 | 111 | 481 |
| 2026-06-29 | 13 | 10 | 43 | 381 |
| 2026-07-06 | 10 | 3 | 12 | 192 |
| 2026-07-13 | 6 | 6 | 10 | 241 |

**76% of all signups (3,659 of 4,827) landed in the two weeks before kickoff.** The week after kickoff
new users fell 97% (2,344 → 61). Acquisition is a hard step function gated entirely on the start
whistle: once the tournament begins, joining is over. Peak write-activity day was **2026-06-11**
(894 active users, 54,082 actions) — kickoff day itself.

---

## 3. The participation funnel

| Step | Users | % of signups |
|---|---:|---:|
| Signed up | 4,827 | 100% |
| Joined ≥1 pool | 4,489 | 93.0% |
| Has an entry | 4,488 | 93.0% |
| Entry marked submitted | 3,944 | 81.7% |
| Made ≥1 match prediction | 3,211 | 66.5% |
| **Submitted *manually* (not auto)** | **2,062** | **42.7%** |
| Posted any banter message | 1,120 | 23.2% |
| **Typed a real message** | **327** | **6.8%** |
| Created a pool (commissioner) | 477 | 9.9% |

Join-to-entry conversion is excellent (93%). The cliff is between *having* an entry and *acting* on it:
**only 42.7% of registered users ever submitted their own picks**; the rest were carried by auto-submit.

Other funnel facts:
- 247 users joined more than one pool (5.5% of joiners).
- 93 of 477 commissioners ran more than one pool (19.5%); the busiest ran 8.
- 293 membership exits total: **175 left voluntarily, 118 were removed** by an admin.
- 2,196 users who are pool members have no `last_login` at all — but 1,746 of them submitted
  predictions and 921 did so *manually*. This is caveat #1, quantified: **`last_login` is missing for
  people who demonstrably used the product.**

---

## 4. Pools — half of them never became a contest

| Pool size | Pools | Members | % w/ banter | Human msgs/member | % members submitted |
|---|---:|---:|---:|---:|---:|
| 0 (empty) | 72 | 0 | — | — | — |
| 1 (solo) | 247 | 247 | 1.6% | 0.02 | 29.6% |
| 2–4 | 111 | 288 | 21.6% | 0.42 | 69.1% |
| **5–9** | **58** | **420** | 37.9% | **1.24** | 84.3% |
| 10–19 | 70 | 1,010 | 48.6% | 0.54 | 92.4% |
| 20–49 | 49 | 1,483 | 59.2% | 0.26 | 93.5% |
| 50+ | 16 | 1,355 | 68.8% | **0.07** | 96.2% |

Median pool = **1 member**. p90 = 20. Largest = 192.

**51.2% of pools (319 of 623) had one member or none.** Only **251 pools (40.3%) had 2+ submitted
entries** — i.e. were an actual contest. But those 251 pools contain **91.9% of all members**, so the
long tail of dead pools is noise in headcount terms and signal in commissioner-experience terms: about
half the people who tried to start a pool never got anyone to join.

### The single most actionable finding in this document

Participation and conversation move in *opposite* directions as a pool grows:

- **Submission rate rises monotonically with size** — 29.6% (solo) → 96.2% (50+). Peer pressure works.
- **Conversation peaks hard at 5–9 members and then collapses.** 1.24 human messages per member at
  5–9, falling to 0.07 at 50+ — an 18× drop. The share of members who ever type follows the same
  curve: 15.3% (2–4), 14.5% (5–9), 9.5% (10–19), 7.6% (20–49), **2.4% (50+)**.

Big pools are excellent leaderboards and dead rooms. The 5–9 pool is where the product's stated
purpose — bringing people together — actually happens. Nothing in the current product steers a
commissioner toward that size.

### Mode split

| Mode | Pools | Members | Avg size | Entries | Submitted | Auto-submitted |
|---|---:|---:|---:|---:|---:|---:|
| progressive | 281 | 2,201 | 7.83 | 2,213 | 1,881 | 1,708 |
| full_tournament | 243 | 1,730 | 7.12 | 1,768 | 1,509 | 325 |
| bracket_picker | 99 | 872 | 8.81 | 998 | 859 | 0 |

Progressive won the mode race on adoption (45% of pools). Note its auto-submit rate: 1,708 of 1,881
submissions carry the auto flag at entry level — that flag is an artefact of the per-round model, so
read §6 for the real progressive engagement picture.

Top pools by size: Polla Mundialera - Banco Ripley (192), EGYM CUP (156), Procurement World Cup
Challenge 2026 (111), Voenk's WK POOL 2026 (105).

---

## 5. Banter — the social layer barely fired

| | Count |
|---|---:|
| Total messages | 4,628 |
| — `badge_flex` (auto card) | 1,730 |
| — `standings_drop` (auto card) | 1,188 |
| — `prediction_share` (auto card) | 39 |
| — **`text` (a human typed it)** | **1,671** |
| Replies | 35 |
| Messages with @mentions | 80 |
| Reactions | 219 |

**63.9% of all banter is auto-generated share cards.** Only 1,671 messages in the entire World Cup were
written by a person.

- 234 of 623 pools ever saw a message (37.6%).
- **Only 124 pools (19.9%) ever saw a human-typed message.** 499 pools never did.
- 1,120 users posted something; **327 typed something** (6.8% of all users).
- **The top 10 pools produced 63.7% of all human messages.** Conversation is not a product-wide
  behaviour; it is a property of a handful of rooms.
- Only 27 pools reached 10+ human messages. 44 pools cleared the "real community" bar of 5+ submitted
  entries *and* 5+ human messages.
- 35 replies and 219 reactions across 5 weeks means threading and reactions were essentially unused.

The gap between 4,628 "messages" and 1,671 human ones is the difference between a metric that looks
healthy on a dashboard and a room where anyone is actually talking.

---

## 6. Retention — the honest read

### Progressive mode, per round (the cleanest engagement signal in the dataset)

Denominators differ by round because admins opened rounds per-pool.

| Round | Pools opened | Eligible entries | Submitted | Manual | **% manual of eligible** |
|---|---:|---:|---:|---:|---:|
| group | 274 | 1,931 | 1,695 | 1,492 | **77.3%** |
| round_32 | 266 | 2,109 | 1,199 | 1,179 | **55.9%** |
| round_16 | 255 | 2,105 | 1,107 | 1,096 | 52.1% |
| quarter_final | 253 | 2,064 | 1,254 | 1,241 | 60.1% |
| semi_final | 276 | 2,153 | 1,201 | 1,189 | 55.2% |
| third_place | 257 | 2,109 | 881 | 879 | 41.7% |
| final | 259 | 2,183 | 936 | 934 | **42.8%** |

The cliff is the **group → round-of-32 transition: 77.3% → 55.9%, a 21-point drop in one step.** That
is the moment a third of the field stops re-engaging. After that the curve is remarkably flat (52–60%)
through the semi-finals, then settles at ~42% for the final. The QF bump (+8pts) is real and worth
understanding — it coincides with the highest-drama round.

Read positively: **more than 4 in 10 progressive players were still manually submitting picks for the
final, five weeks after they joined.** For a free product with no working notifications (§7), that is
a strong number.

### User-level retention across tournament phases

| Cohort | Users | Retained |
|---|---:|---:|
| Active in group-stage window | 851 | — |
| …also active in R32/R16 | 423 | 49.7% |
| …also active in QF→final | 368 | 43.2% |
| …active in all four phases | 282 | 33.1% |
| Pre-kickoff actives (Jun 1–11) | 2,802 | — |
| …still active at QF→final | 1,077 | **38.4%** |

By presence (the more reliable signal): **2,148 users were last seen after the final** — they stayed to
the end. 110 have been seen in August, three weeks after the tournament closed. That is the residual
audience for Premier League.

---

## 7. Notifications — the channel was dark for the entire World Cup

| Ledger | Rows written | Distinct users claimed |
|---|---:|---:|
| `push_match_starting_sent` | **101,421** | 1,086 |
| `push_deadline_warnings_sent` | 8,465 | 3,075 |
| `push_predict_reminder_sent` | 6,756 | 1,865 |
| `push_matchday_recaps_sent` | 365 | 357 |
| `push_weekly_recaps_sent` | 197 | 197 |
| **Total** | **117,204** | — |

Against that: **`push_tokens` holds 18 tokens for 13 users**, and `push_notification_preferences` has
10 rows.

Cross-referencing the claims against token ownership:
- Of 101,421 match-starting claims, **309 belonged to a user who had any token at all.**
- Of 8,465 deadline warnings, **27 did.**

The claim row is inserted before delivery is attempted, and `sendPushToUser` returns `{sent: 0, total: 0}`
when a user has no token — so **117,204 notifications were "sent" to a population of 13 devices.** This
is consistent with the RN app being testers-only during the World Cup, but the size of the gap is the
point: **the entire tournament ran with effectively zero push notifications, and the retention numbers
in §6 were achieved without them.**

Two consequences:
1. §6's retention is a *floor*, achieved with no re-engagement channel whatsoever. There is real
   headroom here for Premier League.
2. Any dashboard reading `push_*_sent` as a delivery metric is off by roughly four orders of magnitude.
   These tables need a `delivered` column or the counts need to be joined against `push_tokens`.

---

## 8. Scoring & competitiveness

Excluding the 99,999,999 outlier. 4,978 entries.

| Mode | Entries | Zero-score | Median | p90 | Max |
|---|---:|---:|---:|---:|---:|
| bracket_picker | 998 | 12 | 151 | 309 | 480 |
| full_tournament | 1,768 | 30 | 5,375 | 8,023 | 17,425 |
| progressive | 2,212 | 34 | 5,875 | 12,125 | 24,950 |
| **All** | **4,978** | **76** | **4,325** | **10,525** | **24,950** |

Only 76 entries (1.5%) finished on zero. Progressive had the widest spread (p90/median = 2.06 vs 1.49
for full_tournament) — the round-by-round format rewarded sustained engagement, which is the correct
behaviour.

### Did no-shows get free points? No.

Splitting entries by what they actually put in:

| Mode | Cohort | Entries | Avg pts | Median |
|---|---|---:|---:|---:|
| bracket_picker | zero input | 98 | 0 | 0 |
| bracket_picker | bracket only | 900 | 184 | 152 |
| full_tournament | zero input | 251 | 36 | 0 |
| full_tournament | made predictions | 1,517 | 5,135 | 5,400 |
| progressive | zero input | 314 | 286 | 0 |
| progressive | made predictions | 1,872 | 6,524 | 6,038 |

**663 entries (13.3%) submitted literally nothing**, and they scored a median of 0. The
"empty-bracket bonus inflation" concern does not show up at entry level in the final ledger — true
no-shows earned essentially nothing. (The elevated *means* for zero-input cohorts are a handful of
adjusted entries pulling the average; medians are 0 across the board.)

Point adjustments: **939 rows across 38 pools.** Excluding the WINNER row, net **−16,929 points** —
i.e. admins used adjustments overwhelmingly to *correct downward*, not to gift.

### Badges

18,575 unlocks, 3,059 users, 14 types.

`oracle` 3,133 · `sharpshooter` 3,064 · `on_fire` 2,584 · `showtime` 2,104 · `ice_breaker` 1,986 ·
`lightning_rod` 1,944 · `stadium_regular` 1,944 · `grand_finale` 788 · `legend` 551 · `top_dog` 408 ·
`globe_trotter` 63 · **`bp_world_map` 2 · `bp_cartographer` 2 · `bp_full_bracket` 2**

⚠️ **The three bracket-picker badges fired twice each** — across 99 bracket_picker pools and 998
entries. Either their thresholds are unreachable or the detection never ran for that mode. Worth a
look before Premier League ships more mode-specific badges.

---

## 9. Infrastructure

**Fixture sync** — 128,510 runs (2026-05-09 → 2026-08-08), **11 with errors (0.009%)**. 9,347 fixture
changes applied. Peak 1,441 runs/day (2026-06-18).

Tournament window (Jun 11 – Jul 19), 55,960 runs:

| | Value |
|---|---|
| p50 duration | **0.1–0.4s** |
| p95 duration | **<1.5s** on every day but one |
| Runs > 5s | 738 (1.3%) |
| Runs > 60s | **521 (0.93%)** |
| Worst run | **295.7s** (2026-06-16) |

This nuances the "sweeps ran 264–296s against a 60s schedule" note in the programme docs. That is
accurate as a **worst case, not as typical behaviour** — the median sweep completed in a tenth of a
second, and fewer than 1% breached the 60s schedule. The tail is real (up to 25 breaches on a busy
day, ~5 minutes of leaderboard lag each), but the system was not broadly saturated. The fix should be
scoped to the tail, not to the median.

**Admin actions** — 480 logged:

`unlock_predictions` **305 (63.5%)** · `update_live_score` 56 · `set_status` 32 · `enter_result` 20 ·
`delete_pool` **12** · `round_state_override_open` 8 · `data_source_changed` 5 · `update_branding` 5

Two things stand out:
1. **`unlock_predictions` is 63.5% of all admin activity** — 305 unlocks across 75 pools by 78 admins,
   spanning 2026-06-08 to 2026-07-21. Commissioners spent most of their admin time letting people back
   in to edit picks. That is a product signal, not an ops signal: either the lock is too early, too
   strict, or too poorly explained.
2. **`delete_pool` fired 12 times** during the tournament — the window in which the "Delete Pool wipes
   predictions" defect was live (now closed, archive replaced delete on 2026-07-30).

**Platform**: `user_presence` is 4,035 web vs 7 mobile. The World Cup was a web product.

---

## 10. When people submitted

Relative to their pool's prediction deadline (2,060 manual submissions, full_tournament + bracket_picker):

| Timing | Entries | % |
|---|---:|---:|
| >7 days early | 581 | 28.2% |
| 2–7 days early | 627 | 30.4% |
| 24–48h early | 357 | 17.3% |
| 6–24h early | 288 | 14.0% |
| 1–6h early | 149 | 7.2% |
| Final hour | 57 | 2.8% |
| After deadline | 1 | 0.05% |

**58.6% submitted 2+ days early** and only 2.8% in the final hour. Players are not procrastinators —
the deadline pressure narrative does not hold. The absolute volume peak (443 and 447 manual submits on
Jun 10 and Jun 11) reflects *when pools opened*, not last-minute panic.

Exactly one submission landed after its deadline, which is the DB kickoff-lock trigger doing its job.

---

## 11. What the data says, in order of importance

1. **Acquisition is a two-week window bolted to the sporting calendar.** 76% of signups in 14 days,
   then a 97% collapse. For Premier League — a 38-week season with no single kickoff — this either
   breaks the growth model or fixes it. Nothing in the World Cup data tells us which.
2. **Half of all pools never became a contest.** 51.2% had ≤1 member. 477 people tried to be
   commissioners; roughly half of them ended up alone in a room. Since the stated success metric is
   *repeat commissioners*, the invite/join step is the highest-leverage surface in the product.
3. **5–9 members is the social sweet spot, and the product doesn't know it.** Conversation per member
   is 18× higher there than in 50+ pools, while submission rate keeps climbing with size. These are
   different goals and they need different guidance to the commissioner.
4. **The social layer is 64% robots.** 1,671 human messages, 327 humans typing, 63.7% of them
   concentrated in ten pools. Banter as shipped is a share-card feed, not a conversation.
5. **Notifications were dark all tournament** — 117,204 claims against 13 devices. Every retention
   number in §6 is a floor achieved with no re-engagement channel. This is the clearest untapped lever
   for next season, and it also means the ledger tables currently misreport by ~4 orders of magnitude.
6. **Retention is better than it looks.** 42.8% of eligible progressive entries manually submitted for
   the final; 2,148 users were last seen after the final whistle. The one real cliff is
   group → round-of-32 (−21 points).
7. **`unlock_predictions` being 63.5% of admin work** is a UX defect wearing an ops costume.
8. **The infra held.** 0.009% sync error rate, sub-second median sweeps, 0.93% breaching the 60s
   schedule. The scale work should target the tail, not a rewrite.
9. **Data hygiene to fix before Premier League:** `last_login` writes, `push_*_sent` delivery
   semantics, and the bracket-picker badges that fired twice in 998 entries.
