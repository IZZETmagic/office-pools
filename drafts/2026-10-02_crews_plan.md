# Crews — the plan (RN first, web day two)

**2026-10-02.** Asked by Ryan: *"write up the complete plan and steps to implement this in RN and day two
web."* Follows the design agreed in this session and mocked on the device
(`mobile/app/crews-concept.tsx`, Profile → Developer → My Crews concept).

Everything below was read in the tree at `53bef13e` or queried against production
(`ujthamlehjyubbzxbnes`) on 2026-10-02. Nothing is built yet. **This is a plan for approval, not a
record of work.**

---

## 1. What we're building, in one rule

> **You're in a crew because you played in one of its pools.**

- No crew invites, no requests, no accept step, no people-picker, **no friends list.**
- A crew is only ever **named from a group that already played** — after a pool finishes, or by picking
  it on the create flow's name screen.
- Each new season every member gets a **held seat**. Taking it is the yes. Ignoring it costs nothing: it
  goes quietly at first lock and nobody is told.
- **My Crews lists groups, never people.**
- Crew decisions live in **Activity → Needs you**, beside picks.

Disclosure-gate tooltip, which is the whole mechanism: *"You're in this crew because you played in its
pools. Each new season you get a saved spot — use it or don't. We'll remind you once. Leave anytime."*

### Why now: the number that frames it

| Production, 2026-10-02 | |
|---|---|
| Finished World Cup pools with 2+ members, not archived | **302** |
| Distinct admins of those pools | **253** |
| Sizes | 120 of 2–5 · 88 of 6–15 · 74 of 16–40 · 16 of 41–100 · 4 over 100 |
| People in **any** league pool | **21**, of whom 8 also played the World Cup |

The league product exists; the groups that would play it are sitting in 302 finished World Cup pools.
**Crews are the bridge from those groups to the league season**, not a feature for the 21. The day this
ships, every one of those 253 admins who opens the app sees *"Keep this group together?"* in Needs you.

It also makes the **primary metric** (vision §8, *repeat commissioners*, risk **R7**, unmeasured)
countable for the first time: *crews with two or more pools*.

---

## 2. Amendments to the recorded decisions

`SPORTPOOL_PROGRAMME.md` → *Multi-sport platform* is the source of truth. This plan diverges from it
in places; each one is stated here rather than built quietly.

| Decision | Today it says | This plan | Why |
|---|---|---|---|
| **D1, creation route (2)** | "Directly, any time" | **Removed.** | A crew with no pool behind it needs a people-picker, and a people-picker is a friends list. Route (3), suggested crews, was already parked on 2026-09-28. Only route (1) remains. |
| **D1, membership** | Not defined | **Defined by having played** in one of the crew's pools. | This is the one rule above. |
| **D1, departure** | "Still open" (programme line ~3510) | **Settled.** Leave in one tap; your history stays; open seats are released. Removal = no more seats; not notified. A captain who leaves hands over to the co-captain, or else to the longest-standing member. | It fell out of the membership rule. |
| **D2, roster review** | "A service to the captain" | Done by **whoever starts the pool**, because any member can. | D1 already lets any member start a pool. |
| **D2, "guard against a crew already playing that competition"** | Guard | A **confirm**, not a block: *"Bermuda Office is already playing the Premier League (Pick'em). Start another?"* | A crew running Pick'em **and** LMS on the same season is the D3 range working as intended. |
| **D3, name screen** | "Name · Crew · Who can join · Create" | Kept. ⚠ The mock's "Unlisted" wording was wrong: privacy today is one boolean, `is_private` (Public = listed in Discover, Private = code only). | There is no unlisted option to show. |

---

## 3. Prerequisites — found this pass, and they come first

**P1 · 🔴 Pool-level privilege escalation (security, independent of crews, do first).**
I confirmed the following from the live catalog; I did not attempt the exploit.
- `pool_members` UPDATE policy *"Users can update own membership"* has **no `WITH CHECK`**.
- `authenticated` holds an **UPDATE grant on `role`**.
- The only trigger on the table is `trg_pool_member_tier_cap` (INSERT).

So a member can PATCH their own row to `role='admin'`, and `is_pool_admin()` believes it. The INSERT
policy *"Users can join pools"* similarly lets a direct client insert set `role`, and it skips
`accepting_members`, `status` and `is_private`.

This is the same class of bug as migration **145** (*a member cannot promote themselves*), which
fixed `users` only. The fix is the same shape: a **trigger** that asks *who* is changing `role`, not a
column revoke. Crews add two new roles of their own (captain and co-captain); we should not build
on a table where roles can be self-assigned.

**P2 · No single owner for "a pool's first lock".** Seats expire at first lock, and nothing computes it
today. The pieces live in four places:
- World Cup: `prediction_deadline`.
- Progressive: `pool_round_states`.
- League: the `lock_at` of `max(league_start_matchweek, first open week)`. The first-open-week half is
  **not stored**.
- Table mode: `league_table_lock_at`.

⚠ A league pool's `prediction_deadline` is the season's **last** kickoff. It must never be used as a
lock.

→ Add SQL `pool_first_lock_at(pool_id)`, mirrored in a pure TypeScript module and tested against it.

**P3 · League pools never finish.**
- `lib/auto-archive.ts` completes a pool when every `matches` row is done. League fixtures live in
  `league_fixtures`, so all 20 league pools sit at `open` forever.
- The real season-end signal already exists: a row in `league_standings_final`.

→ Add `pool_finished_at(pool_id)`, derived as follows:
- World Cup: `status='completed'`.
- League: the `league_standings_final` snapshot.

The "Keep this group?" prompt and the crew page's *Playing now* / *Past seasons* split both read it.

**P4 · One join path.** `app/api/pools/join/route.ts` holds the join logic:
- membership insert;
- `restoreEntriesForMember`;
- entry insert;
- `regenerateDuelSchedule`.

Taking a seat must do exactly the same, so extract it into `lib/pools/join.ts` and call it from both.

**P5 · Activity API versioning.** The route gates on `search.get('v') === '2'`, a strict string
compare, so a build that asks for `v=3` would currently get the **v1** response. Change it to a
numeric `>= 2` before any build sends 3.

---

## 4. Data model — migration `151_a_crew_is_who_played`

Four additions. **All crew tables are deny-all**: RLS on, zero policies, admin client only. They must
be added to `lib/league/__tests__/denyAllTables.guard.test.ts`.

Every read and write goes through an API route. That keeps the 145/P1 bug class off these tables by
construction: no client can write a role.

```
crews
  crew_id               uuid pk
  name                  text not null
  created_by            uuid → users
  created_from_pool_id  uuid → pools (nullable; the pool it was saved from)
  created_at            timestamptz

crew_members
  crew_id, user_id      pk
  role                  text check (captain | co_captain | member)
  joined_at             timestamptz
  joined_via_pool_id    uuid → pools
  left_at               timestamptz null
  left_reason           text null check (left | removed)   -- both set or both null

crew_seats              -- a held seat: NOT a pool_members row, NOT an entry
  pool_id, user_id      pk
  crew_id               uuid
  held_at               timestamptz
  resolved_at           timestamptz null
  resolution            text null check (taken | declined | released)
  notified_at, reminded_at  timestamptz null

pools.crew_id                    uuid null → crews   -- set once, from null; trigger-guarded
pools.crew_prompt_dismissed_at   timestamptz null    -- "Not now" on Keep this group?
```

**What is derived, not stored** (the matchweek-rhythm rule):
- **Whether a seat is open:** `resolved_at IS NULL AND now() < pool_first_lock_at(pool_id)`. Expiry
  needs no cron, so nothing can lag.
- **Crew history:** pools where `crew_id = X`, joined on `pool_entries.pool_id/user_id`. Those are the
  denormalised columns from 056, so an entry detached by an admin removal still counts.

**Why a `left_at` flag here, when 056 rejected one for `pool_members`:** 056's reason was the 136
sites that read `pool_members`. `crew_members` is new, has one reader (`lib/crews/`), and is never
reached through RLS. That argument doesn't transfer.

**Never in the history:**
- **No summed points across pools or modes.** It's the same mistake as the old Profile "Total Points".
- **No rank for LMS** (see the LMS notes in memory).

The all-time table is **seasons played · titles · best finish**. Titles and finishes come from each
mode's own owner (`lib/podium.ts`, league final standings), never from `current_rank` directly.

---

## 5. Server — `lib/crews/` + `app/api/crews/`

Pure decisions go in `lib/crews/*.ts`, with vitest coverage. Routes are thin.

| Route | Who | Does |
|---|---|---|
| `GET /api/crews` | me | My crews: name, people, seasons, status chip (live / seat saved / quiet), leader line, my line |
| `GET /api/crews/:id` | active member | Playing now, all-time, past seasons, members (with roles) |
| `POST /api/crews` `{pool_id, name, co_captain_user_id?}` | that pool's admin | **Save as a crew.** Creates the crew. Members = the pool's non-spectator members; the admin becomes captain. Sets `pools.crew_id`. |
| `POST /api/pools/:id/crew-prompt/dismiss` | pool admin | "Not now", for good |
| `PATCH /api/crews/:id` | captain / co-captain | Rename; set co-captain |
| `POST /api/crews/:id/leave` | me | `left_at`, `left_reason='left'`; release my open seats; captain succession |
| `POST /api/crews/:id/members/:user_id/remove` | captain / co-captain | `left_reason='removed'`; release their open seats silently |
| `POST /api/crews/seats/:pool_id/take` | the seat's holder | `lib/pools/join.ts`, then `resolution='taken'` |
| `POST /api/crews/seats/:pool_id/decline` | the seat's holder | `resolution='declined'` |
| `GET /api/crews/:id/roster?for=pool` | active member | Roster review: who gets a seat, with reasons |

**Changes to existing routes:**
- **`POST /api/pools/create`:** accepts `crew_id`. It:
  - checks the caller is an active member of that crew;
  - sets `pools.crew_id`;
  - forces `is_private = true` (decision 6);
  - creates one `crew_seats` row per ticked member, minus the creator;
  - queues the seat notice.

  The same-competition confirm is a pre-check on the client, using the crew read.
- **`lib/pools/join.ts`** (from P4): joining a crew pool:
  - adds you to `crew_members` if you have no row;
  - does **not** reinstate a `left`/`removed` row (decision 3);
  - resolves any open seat of yours as `taken`.

  So joining by the ordinary `/join/<code>` link **also takes the seat**, which means the emails can
  link to the page that already exists on the web.

**Roster review reasons, v1:** only what we can derive today.
- *"Didn't play last season"*: their seat in the crew's previous pool expired or was declined, or they
  had no picks.
- *"Hasn't opened SportPool in 6 months"*: if a last-active signal exists; check `user_presence` first.
- *"Email bounced"*: not in v1, because bounces live in Resend, not Postgres. It needs a webhook.

Everyone is ticked by default; hard failures are unticked. **Unticked = no seat row**, so there's no
extra state and nobody is notified.

**⚠ Size cap meets crew size.** New pools enforce `pool_tier_member_cap`: Free 10, Plus 30. A
14-person crew starting a Free pool would let the 11th person to take a seat hit `pool_full`, in
public, after being told their spot was saved. That's the worst version of the problem.

The roster review is where it has to surface honestly: *"14 in this crew · a Free pool holds 10."*
**Decision 7** below. Monetization v2 (*"priced on size; a new season is a new pool"*) is unchanged by
any of the options.

---

## 6. Activity → Needs you (API v3)

`lib/activity/needsYou.ts` builds items from league card facts only. Crew items come from a sibling,
`readCrewNeeds(userId)`, merged into the same list:

| Kind | Shown to | Appears | Deadline | Gone when |
|---|---|---|---|---|
| `crew_seat` | the seat's holder | a crew pool is created | `pool_first_lock_at` | taken, declined, or first lock passes |
| `crew_save` | the pool's admin only | a crewless pool is finished (P3) with 2+ non-spectator members, not archived, not branded, not dismissed | **none** (sorts last) | saved, or "Not now" (for good) |

**Type changes (both sides):**
- `kind` gains the two values.
- `deadline_at` becomes `string | null`, and the sort puts nulls last. Today's string compare would
  break on null.
- Add `actions: {id, label, style}[]` and `crew_name`.
- The existing pick/LMS/table items are unchanged.

**⚠ Old builds:** a v2 build renders an unknown kind generically, with an empty deadline pill, "Not
done yet" and one tap, and it can never clear it. So crew kinds go out **only to `v >= 3`**, which
needs P5 first.

**Mobile:**
- `CrewNeedsCard` (already sketched in the concept) with two buttons. Each one calls its route, then
  refreshes Activity.
- `NeedsYouCard` stays exactly as it is.
- **Tab dot:** decision 2. My recommendation: `crew_seat` lights it and `crew_save` does not.

There is **no web Activity page**, so web gets these items on the dashboard. See §8.

---

## 7. RN build — steps in order

Each step is a commit; nothing is pushed until Ryan says so.

1. **P1 security trigger** (migration `151a` or its own number) + verification script.
2. **P2–P5:**
   - `pool_first_lock_at` / `pool_finished_at` (SQL + TypeScript mirror, tested against each other on
     real pools);
   - `lib/pools/join.ts` extraction (behaviour-identical; existing join tests pass);
   - numeric `v` gate.
3. **Migration 151** (schema in §4).
   - Before applying: `scripts/verify-select-columns.ts`; hash `prosrc` on both sides.
   - Apply via MCP; add the tables to the deny-all guard test.
4. **`lib/crews/` + routes** (§5), with vitest coverage of the pure parts:
   - membership-on-join;
   - seat open / closed;
   - captain succession;
   - roster reasons;
   - all-time aggregation per mode.
5. **Activity v3** (§6): server builder, route, and `mobile/lib/api.ts` types; `useActivity` sends
   `v=3`.
6. **RN screens.** Data via **react-query + API** (`useCrews`, `useCrew`), the pattern `useLeaguePool`
   uses, not hand-rolled PostgREST.
   - `mobile/app/profile/crews.tsx`: the list. Wire the Profile tile's `onPress`; drop "Soon".
   - `mobile/app/profile/crews/[id].tsx`: the crew page. Captain controls (rename, co-captain, remove)
     live in a member's sheet; **there is no add button.**
   - The create wizard's `details` step gains the **Crew** row: your active crews + "No crew". The
     logic goes in `mobile/lib/createPool.ts`, which stays pure and tested.
     - The roster review opens from the row: *"13 get a saved spot · Review"*.
     - The same-competition confirm runs on Next.
     - `buildCreatePayload` gains `crew_id`. The private-by-default guard test must still pass.
   - Pool **Info tab:** *"Part of Bermuda Office"* → the crew page; before first lock,
     *"9 in · 3 spots saved"*. This is a single line, not rows in the leaderboard (decision 5); the
     leaderboard read path is not touched.
   - `CrewNeedsCard` in the Activity tab.
   - `usePushNotificationHandlers` gains `case 'crew_seat'` → Activity. Old builds ignore it
     harmlessly.
7. **Notifications** (Decision 2's *one reminder*, always SportPool-branded, **never in the captain's
   name**):
   - **Seat held:** one push (category `POOL_ACTIVITY`, so no new preference column or OTA) and one
     email (topic `POOL_ACTIVITY`), sent when the pool is created.
     - The email CTA → `sportpool.io/join/<code>`, which already exists and now takes the seat.
     - Plural "we" voice; `components.ts` helpers.
   - **One reminder**, about 24 h before first lock, only if the seat is still open. It uses the
     league-outbox "only once" pattern via `crew_seats.reminded_at`, run from an existing cron (verify
     by `net._http_response`).
   - **No notification ever names who hasn't taken a spot.**
8. **Delete the concept:** `crews-concept.tsx`, its `Stack.Screen` and its dev row.
9. **Ship, in the order that has bitten before:**
   1. Deploy the API.
   2. Verify a **new route 404→401** on prod.
   3. `git status` clean.
   4. `eas channel:view`.
   5. `eas update` **per platform**, and check both Commit lines.

   ⚠ The Android OTA still reaches nobody (avatar store release notes).
10. **Gill** records what changed in the programme + HTML.

**Size, roughly:**

| Steps | Days |
|---|---|
| 1–2 | ~2 |
| 3–4 | ~3½ |
| 5 | ~1½ |
| 6 | ~4 |
| 7 | ~1½ |
| 8–10 | ~½ |
| **RN total** | **~13 working days** |

---

## 8. Web, day two

The server and the data are done by then, so web is rendering only. There's one quiet day-one win:
**the seat emails already work on web**, because `/join/<code>` takes the seat.

1. **Create modal** (`components/pools/CreatePoolModal.tsx`): the same Crew row, roster review and
   confirm on the Details step, posting the same `crew_id`.
2. **Profile → Crews tab** (`app/profile/ProfilePage.tsx` `TAB_CONFIG`, `?tab=crews`) and a crew page at
   `app/crews/[crew_id]/page.tsx`, reading the same `GET /api/crews*`.
3. **Dashboard "Needs you" strip** above My Pools (`DashboardClient.tsx`), crew items only. It uses the
   same `readCrewNeeds`, so web and RN cannot disagree. Web has no Activity page, and this is not the
   moment to build one.
4. **Pool page:** the same *"Part of…"* line and seat count on `PoolInfoTab`.

About **4 days**.

---

## 9. Decisions I need from you

| # | Question | My recommendation |
|---|---|---|
| 1 | Record §2's amendments to D1/D2 in the programme? | Yes — the build follows them either way, so the record should too |
| 2 | Does `crew_save` (no deadline) light the Activity tab dot? | **No** — the dot means "something has a clock on it" |
| 3 | If someone left or was removed, does joining a crew pool by link put them back in the crew? | **No** — an explicit exit sticks; they can still play that pool |
| 4 | Co-captain at save time: required, or optional with a nudge later? | **Optional**, nudge on the crew page |
| 5 | Pending seats inside the pool: a count line, or rows like the mock? | **A count line** — leaderboard read paths stay untouched |
| 6 | Crew pools forced Private (never listed in Discover)? | **Yes** — otherwise strangers from Discover become crew members by the one rule |
| 7 | Crew bigger than the pool's tier cap (Free 10)? | Say it honestly in roster review — *"a Free pool holds 10"* — and let the starter choose Plus or who gets a spot. Never let the 11th person find out by hitting `pool_full` |
| 8 | Email the 253 World Cup admins once at launch (*"Keep your World Cup group together"*)? | Yes, once, after the RN release is live — but it's outward-facing, so it's your call, and it gets its own copy review |
| 9 | Captain leaves with no co-captain? | Longest-standing member becomes captain, and the crew page says so |

## 10. Not in this plan

- **Run it back** (D2): the crew row makes it cheaper later, but it isn't needed for Crews to work.
- **Suggested crews:** parked 2026-09-28.
- **Crew banter:** banter stays per pool (D1).
- **The `pools` → Crew + Season migration:** not needed. Crews sit **beside** today's pools via
  `pools.crew_id`; the 643 existing pools are untouched until an admin chooses to save one.
- **The join route accepting a bare `pool_id` for private pools:** part of the P1 conversation, but
  any tightening must keep **crew members** able to join their crew's pool from the crew page.
