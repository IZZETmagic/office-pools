# Crews — the plan (RN first, web day two)

**Status: all nine decisions settled with Ryan on 2026-10-02 (§9). Ready to build, starting with P1.**

**2026-10-02.** Asked by Ryan: *"write up the complete plan and steps to implement this in RN and day two
web."* Follows the design agreed in this session and mocked on the device
(`mobile/app/crews-concept.tsx`, Profile → Developer → My Crews concept).

Everything below was read in the tree at `53bef13e` or queried against production
(`ujthamlehjyubbzxbnes`) on 2026-10-02. Nothing is built yet. **This is a plan for approval, not a
record of work.**

---

## 1. What we're building, in two rules

> **You're in a crew because you played in one of its pools — or because you said yes when its captain
> added you.**

- **No friends list.** Nothing to browse, no suggestions, no "people you may know". Adding someone is a
  **lookup**: type one exact username or email, confirm the face, add them to *this* crew.
- Two ways a crew starts:
  - **named from a group that already played**, after a pool finishes or on the create flow's name
    screen;
  - **created directly**: My Crews → New crew → name it → add people. *(Ryan, 2026-10-02.)*
- **Played in a crew pool:** in automatically. **Added directly:** one *Join / No thanks* card in Needs
  you, once.
- Each new season every member gets a **held seat**. Taking it is the yes. Ignoring it costs nothing: it
  goes quietly at first lock and nobody is told.
- **My Crews lists groups, never people.**
- Crew decisions live in **Activity → Needs you**, beside picks.

Disclosure-gate tooltip, which is the whole mechanism: *"You're in this crew because you played in its
pools, or said yes when you were added. Each new season you get a saved spot — use it or don't. We'll
remind you once. Leave anytime."*

**Why the added path needs a yes and the played path doesn't:** playing together *is* the consent.
Without it, anyone who knows your username could put you in their crew and trigger season notifications
to you — and *"anyone who knows your username can sign you up and we'll notify you"* fails the gate.

### Why now: the number that frames it

| Production, 2026-10-02 | |
|---|---|
| Finished World Cup pools with 2+ members, not archived | **302** |
| Distinct admins of those pools | **253** |
| Sizes | 120 of 2–5 · 88 of 6–15 · 74 of 16–40 · 16 of 41–100 · 4 over 100 |
| People in **any** league pool | **21**, of whom 8 also played the World Cup |

The league product exists; the groups that would play it are sitting in 302 finished World Cup pools.
**Crews are the bridge from those groups to the league season**, not a feature for the 21.

⚠ **The World Cup was played on the web.** Only **16** of 4,841 users have ever registered a push token,
and **2** of the 253 admins. The app's installed base is somewhat larger than that, because not
everyone allows notifications, but not by orders of magnitude. An RN-only release reaches almost none
of these admins. **So a thin web slice ships with the RN release** (decision 8): the
*"Keep this group together?"* sheet on the web dashboard, plus a basic crew page. There is **no email
campaign** *(Ryan, 2026-10-02)*: the prompt reaches admins who come back on their own, on web or in the
app.

It also makes the **primary metric** (vision §8, *repeat commissioners*, risk **R7**, unmeasured)
countable for the first time: *crews with two or more pools*.

---

## 2. Amendments to the recorded decisions

`SPORTPOOL_PROGRAMME.md` → *Multi-sport platform* is the source of truth. This plan diverges from it
in places; each one is stated here rather than built quietly.

| Decision | Today it says | This plan | Why |
|---|---|---|---|
| **D1, creation route (2)** | "Directly, any time" | **Kept, and defined** *(Ryan, 2026-10-02)*: add people by **exact username or email** — a lookup, not a friends list. **Captain and co-captain** add. Added people **accept once**. An email with no account gets **one invite email** from SportPool. Route (3), suggested crews, stays parked (2026-09-28). | Ryan: crews must be creatable directly, without a friends list. |
| **D1, membership** | Not defined | **Played** in one of the crew's pools, **or accepted** a direct add. | The two rules above. |
| **D1, departure** | "Still open" (programme line ~3510) | **Settled.** Leave in one tap; your history stays; open seats are released. Removal = no more seats; not notified. A captain who leaves hands over to the co-captain, or else to the longest-standing member (tie → most crew pools played). | It fell out of the membership rule. |
| **D1, co-captain "from day one"** | Required from the start | **Optional**, with a standing nudge on the crew page until one is set *(Ryan, 2026-10-02)* | A direct crew has nobody to pick at creation; requiring it on save adds friction at the most important moment |
| **D2, roster review** | "A service to the captain" | Done by **whoever starts the pool**, because any member can. | D1 already lets any member start a pool. |
| **D2, "guard against a crew already playing that competition"** | Guard | A **confirm**, not a block: *"Bermuda Office is already playing the Premier League (Pick'em). Start another?"* | A crew running Pick'em **and** LMS on the same season is the D3 range working as intended. |
| **D3, name screen** | "Name · Crew · Who can join · Create" | Kept. ⚠ The mock's "Unlisted" wording was wrong: privacy today is one boolean, `is_private` (Public = listed in Discover, Private = code only). | There is no unlisted option to show. |

---

## 3. Prerequisites — found this pass, and they come first

**P1 · ✅ DONE 2026-10-02: migration `151_a_member_cannot_crown_themselves`**, applied to production.
It's verified by `scripts/verify-pool-member-guard.sql` (8/8, rolled back), and the live function is
byte-identical to the file. **R34 followed the same day as migration `152_a_member_cannot_score_themselves`**
(`scripts/verify-pool-entry-guard.sql`, 17/17 live).

**P2–P5 ✅ DONE 2026-10-02:**
- **P5:** `lib/activity/version.ts`. The gate is now "at least 2".
- **P4:** `lib/pools/join.ts`, with 10 tests. The route is a thin wrapper.
- **P2 + P3:** migration `153_a_pool_knows_when_it_locks_and_ends` adds `pool_first_lock_at()` and
  `pool_finished_at()`, applied and checked against all 643 pools.

  ⚠ **Changed from the plan:** **no TypeScript mirror.** The SQL functions are the single owner, and
  server code calls them through the admin client. A mirror would be a second owner, which is what
  P2 set out to remove.

**The Crews schema is therefore migration 154.**

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

## 4. Data model — migration `154_a_crew_is_who_played`

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

crew_invites            -- a direct add, waiting for one Join tap
  invite_id             uuid pk
  crew_id               uuid
  invited_by            uuid → users           -- captain or co-captain at the time
  invitee_user_id       uuid null → users      -- matched by username or email
  invitee_email         citext null            -- no account yet; claimed at sign-up
  created_at            timestamptz
  resolved_at           timestamptz null
  resolution            text null check (joined | declined | revoked)
  -- exactly one of invitee_user_id / invitee_email

pools.crew_id                    uuid null → crews   -- set once, from null; trigger-guarded
pools.crew_prompt_dismissed_at   timestamptz null    -- "Not now" on Keep this group?
```

**Database-enforced, because admins can write `pools` directly from the client** (mobile Settings does
`supabase.from('pools').update`):
- `CHECK (crew_id IS NULL OR is_private)`: a crew pool can never be listed (decision 6).
- A trigger lets `crew_id` go from NULL to a value **once**, and only via the service role, so a client
  can't attach a pool to someone else's crew.

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
| `POST /api/crews` `{name}` (no `pool_id`) | me | **Create directly.** A crew of one; I'm captain |
| `GET /api/users/lookup?username=` | signed in | Exact, **case-insensitive** match → display name + avatar to confirm. Never a prefix search |
| `POST /api/crews/:id/invites` `{username}` or `{email}` | captain / co-captain | Creates the invite. Email always answers *"Invite sent"*, whether or not the address has an account |
| `POST /api/crews/invites/:id/join` · `/decline` | the invitee | One tap. Join → `crew_members` row, role `member` |
| `DELETE /api/crews/invites/:id` | captain / co-captain | Withdraw before they answer |
| `POST /api/pools/:id/crew-prompt/dismiss` | pool admin | "Not now", for good |
| `PATCH /api/crews/:id` | captain / co-captain | Rename; set co-captain |
| `POST /api/crews/:id/rejoin` | someone whose own row is `left_reason='left'` | Clears `left_at`. Not available after `removed` |
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

**Direct adds — the rules that keep a lookup from becoming a friends list or a spam channel:**
- **Lookup is exact.** Username matching ignores case, because production has **36** username pairs
  that differ only by case ("Dave" / "dave"). When more than one matches, show each face and let the
  captain pick. No prefix search, no autocomplete over all users.
- **Email never reveals whether an account exists.** It always answers *"Invite sent"*.
  - An existing account gets the Needs-you card and one email.
  - No account: **one** email from SportPool — *"Dave asked us to invite you to Bermuda Office"* —
    linking to sign-up. Plural "we" voice.
  - **Settled with Ryan, 2026-10-02 (a clarification of Decision 2, not an exception to it):**
    *invitations name who asked, once, previewed; reminders never do.*
    - It's **from SportPool**, worded *"Dave asked us…"*, never written as if Dave wrote it.
    - Before pressing Invite, the captain **sees the exact email**: *"We'll send mia@example.com one
      email: …"*.
    - It's **sent once**, with no follow-ups.
    - Seat notices and the one reminder still never name the captain.
- ~~**An email invite is claimed at sign-up only against a *verified* address.**~~ ⚠ Superseded
  2026-10-02 (R36, migration 155): production has email confirmation off, so no address is ever
  unverified. **An email invite is claimed by its one-time link** — the email's button — and the
  invite goes to whoever opens it, signed in. Ryan chose this over turning on confirmation.
- **"No thanks" sticks:** that crew can't re-invite you. They can still bring you in the played way, by
  you joining one of its pools.
- **Rate limit:** about 20 pending invites per crew and 50 per captain per day. That's generous for a
  real group and useless for spam.
- **Pending invitees are not members.** They get no seats, don't count toward the crew size, and
  appear on the crew page only for the captain and co-captain, as *"Invited · waiting"*.

**⚠ Size cap meets crew size.** New pools enforce `pool_tier_member_cap`: Free 10, Plus 30. A
14-person crew starting a Free pool would let the 11th person to take a seat hit `pool_full`, in
public, after being told their spot was saved. That's the worst version of the problem.

**Decided (#7):** seats never exceed what the pool holds, so a saved spot is always a real promise.
- Roster review shows it honestly: *"Bermuda Office · 14 people. A Free pool holds 10."* →
  **Go Plus** (room for 30) or **choose who gets the 9 spots**.
- Unticked people get no seat and aren't told, as with any roster review.
- Upgrading before first lock re-opens the review for the rest.
- `POST /api/pools/create` refuses more seats than `pool_tier_member_cap(tier) − 1`. The rule lives on
  the server, not just in the UI. Monetization v2 (*"priced on size; a new season is a new pool"*) is unchanged by
any of the options.

---

## 6. Activity → Needs you (API v3)

`lib/activity/needsYou.ts` builds items from league card facts only. Crew items come from a sibling,
`readCrewNeeds(userId)`, merged into the same list:

| Kind | Shown to | Appears | Deadline | Gone when |
|---|---|---|---|---|
| `crew_seat` | the seat's holder | a crew pool is created | `pool_first_lock_at` | taken, declined, or first lock passes |
| `crew_invite` | the invitee | a captain or co-captain adds them | **none** (sorts last) | joined, declined, or withdrawn |
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
- **Tab dot:** all three crew kinds light it *(Ryan, 2026-10-02)*. The rule
`needsYou.length > 0 || unreadMentions > 0` in `mobile/app/(tabs)/_layout.tsx` needs no change.

There is **no web Activity page**, so web gets these items on the dashboard. See §8.

---

## 7. RN build — steps in order

Each step is a commit; nothing is pushed until Ryan says so.

1. ✅ **P1 security trigger:** migration 151 + `scripts/verify-pool-member-guard.sql` (done 2026-10-02).
2. ✅ **P2–P5** (done 2026-10-02, see §3):
   - `pool_first_lock_at` / `pool_finished_at` — SQL only, checked against all 643 pools. ⚠ The
     TypeScript mirror first planned here was dropped (see §3): one owner, not two;
   - `lib/pools/join.ts` extraction (behaviour-identical; existing join tests pass);
   - numeric `v` gate.
3. ✅ **Migration 154** (schema in §4) — applied 2026-10-02 (`20261002233759`); 16/16 dry-run checks, live re-check, guard body byte-identical. Also covers client INSERTs of pools (the pools INSERT policy only checks admin_user_id), which §4 had not named.
   - Before applying: `scripts/verify-select-columns.ts`; hash `prosrc` on both sides.
   - Apply via MCP; add the tables to the deny-all guard test.
4. ✅ **`lib/crews/` + routes** (§5) — done 2026-10-02 in five commits: rules (`163fd3af`), store +
   the join hook (`dcc4f7ef`), reads (`1c086ab6`), routes (`bd85c53c`), and pool creation for a crew
   plus account deletion (this step's last commit). 83 unit tests, plus
   `scripts/verify-crews-store.ts`: **34/34 live** on production as the seeded test accounts, on a
   crew with no pools, deleted afterwards. Found while building, not in §5:
   - **saving a pool as a crew sets it Private** — 84 finished World Cup groups were Public, and a
     crew pool is never listed. The save sheet must say so (RN step);
   - **deleting an account now leaves every crew first** (`leaveAllCrews`), *before* any destructive
     delete — otherwise crew_members cascades and a crew can lose its captain;
   - a crew that has had a season can't be hard-deleted (`pools.crew_id`'s ON DELETE SET NULL is
     refused by the once-only guard). That fits "crews close, never delete";
   - the bare-`pool_id` join door (privacy item) now also joins the crew. Dormant until a crew pool
     exists; `joinPool` is now the one place to close it.

   Originally listed for this step, with vitest coverage of the pure parts:
   - membership-on-join;
   - seat open / closed;
   - captain succession;
   - roster reasons;
   - all-time aggregation per mode.
5. ✅ **Activity — crew cards in Needs you** — done 2026-10-02: server `93eb3ead`, app `b3220834`.
   ⚠ **Changed from the plan: a capability flag, not v3.** The app talks to production, which until
   it deploys answers anything but `v=2` with the v1 response, so a build asking for `v=3` would lose
   Needs You outright (on Ryan's phone the moment Metro reloaded). The app sends `v=2&crews=1`; the
   server adds crew cards only then. Safe in either deploy order. 9 builder tests; the live verify
   script checks all three card kinds (37/37). Crew cards cannot appear on a phone until the API
   deploys, because the app reads production.
   Originally: **Activity v3** (§6): server builder, route, and `mobile/lib/api.ts` types; `useActivity` sends
   `v=3`.
6. ✅ **RN screens** — done 2026-10-02 in five commits:
   - `af488e40`: the data layer (types, words, API calls, query hooks; 13 tests);
   - `35533da4`: every crew person carries their avatar;
   - `576622d8`: My Crews, the crew page and Add people;
   - `cdfc1307`: the create flow's Crew row, roster review with the Free cap, the
     same-competition confirm, and Private locked;
   - `c19f167c`: the pool screens' crew line (count for members, names for the admin, via a new
     `GET /api/pools/:id/crew`).

   Moved or not done:
   - **push routing** for a saved-spot tap moves to step 7, with the notifications it routes;
   - **"Go Plus" from inside the create flow** is not built — a pool's tier is bought after it
     exists, so roster review states what Free holds and lets the starter choose. Follow-up;
   - **the concept screen is kept** (dev-only) until the API deploys. The app reads production, so
     the real screens show their error state on a Metro build until then, and the concept is the
     only way to see the designs on a phone.

   Originally listed — **RN screens.** Data via **react-query + API** (`useCrews`, `useCrew`), the pattern `useLeaguePool`
   uses, not hand-rolled PostgREST.
   - `mobile/app/profile/crews.tsx`: the list. Wire the Profile tile's `onPress`; drop "Soon".
   - `mobile/app/profile/crews.tsx` gains **New crew** (name → add people). This is the only
     people-adding UI: a username/email field with a face to confirm, never a list to browse.
   - `mobile/app/profile/crews/[id].tsx`: the crew page.
     - Captain controls live in a member's sheet: rename, co-captain, remove.
     - **Add people** (captain / co-captain only) opens the same lookup field.
     - Pending invites are shown to them as *"Invited · waiting"*.
   - Sign-up claims verified-email invites, so a new account lands with a *Join* card waiting.
   - The create wizard's `details` step gains the **Crew** row: your active crews + "No crew". The
     logic goes in `mobile/lib/createPool.ts`, which stays pure and tested.
     - The roster review opens from the row: *"13 get a saved spot · Review"*.
     - The same-competition confirm runs on Next.
     - `buildCreatePayload` gains `crew_id`. The private-by-default guard test must still pass.
   - Pool **Info tab:** *"Part of Bermuda Office"* → the crew page; before first lock,
     *"9 in · 3 spots saved"* for everyone. This is a count, not rows in the leaderboard; the
     leaderboard read path is not touched.
   - Pool **Members tab** (admin-only already): a *"Spots saved"* section before first lock, naming
     who is still pending (decision 5). It comes from the server; the admin check is in the route.
     Declined seats are not shown.
   - `CrewNeedsCard` in the Activity tab.
   - `usePushNotificationHandlers` gains `case 'crew_seat'` → Activity. Old builds ignore it
     harmlessly.
7. ✅ **Notifications** — built 2026-10-02 (`6cec6f1c`), ⚠ **switched OFF**: nothing sends until
   `sync_settings.crew_notices_enabled = true`, and `/api/cron/crew-notices` is not scheduled. Both
   are deploy steps. **Wording approved by Ryan 2026-10-02** ("Copy approved"). Changed from below:
   lock times are relative ("in 3 days"); the CTA reads "Take your spot" (the plural-voice test
   caught "my"); invites send inline at the moment of adding, not from the cron.

   Originally: **Notifications** (Decision 2's *one reminder*, always SportPool-branded, **never in the captain's
   name**):
   - **Seat held:** one push (category `POOL_ACTIVITY`, so no new preference column or OTA) and one
     email (topic `POOL_ACTIVITY`), sent when the pool is created.
     - The email CTA → `sportpool.io/join/<code>`, which already exists and now takes the seat.
     - Plural "we" voice; `components.ts` helpers.
   - **One reminder**, about 24 h before first lock, only if the seat is still open. It uses the
     league-outbox "only once" pattern via `crew_seats.reminded_at`, run from an existing cron (verify
     by `net._http_response`).
   - **No notification ever names who hasn't taken a spot.**
8. ✅ **Delete the concept:** `crews-concept.tsx`, its `Stack.Screen` and its dev row — done
   2026-10-02. Nothing else imported from it.
9. **Ship** — 🔨 2026-10-03 (UTC): pushed `53bef13e..406f644d` (on Ryan's word); Vercel production ✅;
   `/api/crews` 404→401, `/api/cron/crew-notices` 404→401, `/crew-invite` 200; cron `crew-notices`
   scheduled (`*/15`, pg_cron job 26) and a hand-fired request answered 200 "skipped" (switch off);
   OTA to `production` / runtime 1.2.0 from `406f644d` on BOTH platforms (iOS group `8f3a029f`,
   Android `5337506d`). ⏸ **The switch is still OFF, waiting on Ryan:** the only message it would send
   is his own invite to Kronosaur (made 02:37 UTC). The Xcode Cloud failure on the commit is the old
   Swift app in `ios/` — not part of this release.

   The order, as planned:
   1. Deploy the API.
   2. Verify a **new route 404→401** on prod.
   3. **Schedule `/api/cron/crew-notices`** (pg_cron; verify by `net._http_response`).
   4. **Turn on `sync_settings.crew_notices_enabled`.** ✅ No longer has to race the deploy: Gill
      found (2026-10-02) that an invite made while the switch was off was never sent or retried —
      and since 155 its link is armed only as the email goes out, so it could never be claimed.
      **Fixed by migration 156** (applied): `crew_invites.notified_at`, the same claim-before-send
      the seat notices use, and `runCrewNotices` now sends every open invite nobody sent, oldest
      first. A claimed invite whose send fails is still not retried (one missed beats two). Verified
      on production by `scripts/verify-crews-store.ts` (53/53) with the mailer's key removed, so
      nothing could reach an inbox.
   5. `git status` clean.
   6. `eas channel:view`.
   7. `eas update` **per platform**, and check both Commit lines.

   ⚠ The Android OTA still reaches nobody (avatar store release notes).
10. **Gill** records what changed in the programme + HTML.

**Size, roughly:**

| Steps | Days |
|---|---|
| 1–2 | ~2 |
| 3–4 | ~4½ (invites, lookup, email claim add ~1) |
| 5 | ~1½ |
| 6 | ~5 (direct create + lookup adds ~1) |
| 7 | ~1½ |
| 8–10 | ~½ |
| **RN total** | **~15 working days** |

---

## 8. Web

### 8a. With the RN release (decision 8, ~1½ days) — ✅ built 2026-10-02

**As built:**
- **Dashboard "Needs you"** (`components/crews/CrewNeedsStrip.tsx`, above My Pools): the same cards
  as the app, from `readCrewNeeds`, crews only (the dashboard's pool cards already carry the pick
  reminders). Buttons map to routes in `lib/crews/needActions.ts` (pure, tested from the real cards).
  *Keep this group together?* opens `components/crews/SaveCrewModal.tsx`, word for word the app's
  sheet, including the private/Discover line; saving lands on the new crew's page. The deadline pill
  reads a subscribed clock, so the server never prints a UTC time.
- **Crew page** `app/crews/[crew_id]/page.tsx` + `CrewPage.tsx`: playing now (Join / I'm in), all-time,
  past seasons, members, Leave (names the next captain first) and Rejoin. Never-members, the removed,
  closed crews and bad ids all 404. `/crews` is a protected route. Captains get a line saying the
  controls are in the app for now (8b).
- **Words** `lib/crews/words.ts` — the web copy of `mobile/lib/crews.ts`; `__tests__/words.test.ts`
  runs both on the same inputs and fails on drift.
- **Email invites are claimed on the dashboard AND in the app's Activity read** — the second was a
  gap from step 5: someone who signed up in the app from an invite email didn't see it in Needs you
  until they opened My Crews. Activity claims only for the caller's own feed, never a super admin's
  view of someone else's.
- **The invite-to-account email's button now goes to `/dashboard`**, not the site root. ⚠ Corrected
  (Gill): a signed-in reader already got there from `/` — the proxy redirects it. The change matters
  for a SIGNED-OUT reader, who `/` left on the marketing page and `/dashboard` sends through login
  and back to the invite. The words are unchanged.
- Verified on localhost: the strip on Ryan's real dashboard (two real *Keep this group together?*
  cards, dialog opened and cancelled — nothing pressed that writes); every card kind, the pill, the
  crew page, the Leave dialog and the left state on a fixture harness that was deleted afterwards.

Originally — the World Cup groups are on the web, so the minimum for them to save a crew ships at the
same time as the RN release:
- a **dashboard "Needs you" strip** with the *"Keep this group together?"* sheet, plus held seats and
  invites (`readCrewNeeds`, the same builder RN uses);
- a **basic crew page** at `app/crews/[crew_id]/page.tsx`: playing now, past seasons, members, Leave.

Seat links already work through `/join/<code>`.

### 8b. Day two — ✅ built 2026-10-02

**As built:**
- **Create modal** (`components/pools/CreatePoolModal.tsx` + `components/crews/CreatePoolCrew.tsx`):
  the Crew row on Details (only for someone in a crew), roster review (`RosterReviewModal`, Done
  disabled over the Free cap), the *Already playing this* confirm — on Next AND on the step header,
  which could otherwise skip it — and a locked "Private — crew pools always are" card on Settings.
  Posts `crew_id` + `seat_user_ids`. The crew dialogs are portaled: the wizard panel keeps its
  slide-up transform, which pins a nested fixed overlay to the panel.
- **Profile → Crews tab** (`?tab=crews`, `components/crews/MyCrewsTab.tsx`): crew cards and New crew.
  The crew page's breadcrumb now leads back here.
- **Crew page captain controls**: Rename, the co-captain nudge and chooser, a member menu (Make
  co-captain / Remove, same rules as the app), Add people (`AddPeopleModal` — exact username or
  email, the email's first line previewed), and INVITED · WAITING with Withdraw.
- **Pool page**: "Part of …" + the saved-spot count on the Info tab, and SPOTS SAVED (names) on the
  admin Members tab (`components/crews/PoolCrew.tsx`). Asks the server each time — the page's pool
  row is cached for 45 s.
- **One owner for the invite preview line**: `words.invitePreviewText`, which `notify.invitePreview`
  now calls. Drift tests cover every mirrored word and both create helpers.
- Verified on localhost: Profile → Crews, a crewless pool's Info tab and the create wizard on Ryan's
  real account (nothing written); every crew-only state on a fixture harness, deleted afterwards.

⚠ **Found while recording 8a (Gill, R36) and CONFIRMED from production:** email confirmation is
OFF — 4,820 of 4,825 email accounts were "confirmed" within 5 s of creation, 0 unconfirmed, all 16
sign-ups in the last 60 days instant. So `email_confirmed_at` proves nothing, and the email-invite
claim ("lands in the crew when they sign up with that verified address") can be taken by whoever
registers the invited address first. Dormant until the API deploys.

✅ **Ryan's call (2026-10-02): the one-time link** — over turning on email confirmation (product-wide,
a "check your email" step on every sign-up) or dropping no-account invites. **Built:**
- **Migration 155** (applied): `crew_invites.token_hash` (SHA-256 only), a CHECK that only an invite
  to an address can carry one, a unique index.
- **Armed when the email goes out** (`notify.sendInviteNotice`); the button is
  `/crew-invite#<token>`. ⚠ The token rides in the URL FRAGMENT, and on arrival the page moves it
  into localStorage and out of the address bar; Sign up / Log in return to the bare page
  (`lib/crews/inviteLink.ts`). ⚠ Corrected (Gill): the first build passed `/crew-invite#<token>` as
  `?redirectTo=`, so for a signed-out reader — the main path — the token DID reach the server and a
  page running Google Tag Manager. Fixed before deploy; `__tests__/inviteLink.test.ts` pins it.
- **`app/crew-invite`** (public): who asked and which crew; signed out → Sign up / Log in, both
  returning to the link; signed in → Join / No thanks (`POST /api/crews/invites/claim`). Opening the
  page answers nothing — only a button does (mail scanners pre-fetch links).
- **The claim is the lock**: one conditional update hands the invite over, answers it and clears
  the token, so a link works once. The sender can't take their own invite, a member is told they're
  in, and a forwarded link can never bring back someone a captain removed (`rules.claimBlock`).
- **The match-by-address claim is gone** (`claimEmailInvites`, `claimInvitesFor`, and its calls on
  the dashboard, the Activity read and three crew routes).
- **One approved sentence changed**, as it would otherwise be false: "Sign up with this email
  address and you'll find the invite waiting" → "Use the button below to sign up and you'll find
  the invite waiting". ✅ **Ryan approved the new sentence (2026-10-02).** Everything else in the
  email is as approved.
- Verified live on production as test accounts: `scripts/verify-crews-store.ts` 48/48 (10 new
  link checks, including the CHECK refusing a link on an account invite); the page on localhost
  signed in, and signed out by its API; everything deleted afterwards.
- Still trusted: an email invite to an address that ALREADY has an account goes to that account.
  That's the platform's general state (any account's address is unverified), and a password reset
  goes to the real inbox — not a crews-specific hole.

Originally:

The server and the data are done by then, so web is rendering only. There's one quiet day-one win:
**the seat emails already work on web**, because `/join/<code>` takes the seat.

1. **Create modal** (`components/pools/CreatePoolModal.tsx`): the same Crew row, roster review and
   confirm on the Details step, posting the same `crew_id`.
2. **Profile → Crews tab** (`app/profile/ProfilePage.tsx` `TAB_CONFIG`, `?tab=crews`). The crew page
   from 8a gains captain controls (rename, co-captain, remove).
   New crew + Add people use the same lookup and invite routes. (Web claiming of email invites
   already shipped in 8a — the dashboard claims them before it reads Needs you.)
3. **Pool page:** the same *"Part of…"* line and seat count on `PoolInfoTab`.

About **3½ days**. With 8a, web is about **5 days** in total.

---

### Disband (added 2026-10-02, after 8b) — ✅ built

Ryan: *"we should have a disband crew option for the captain only."* His calls, asked before building:
**it disappears for everyone** (like a crew whose last member left), **the captain can restore it**,
and **a running crew pool carries on** as an ordinary private pool with untaken saved spots released.

- **Migration 157** (applied): `crews.closed_reason` (`emptied` | `disbanded`) and `closed_by`, so the
  two ways a crew closes are told apart — only a disband can be undone. Leaving as the last member now
  records `emptied`.
- `store.disbandCrew` / `restoreCrew`, captain only (`rules.canDisband` / `canRestore`); routes
  `POST /api/crews/:id/disband` and `/restore`. Member rows are untouched, so restore brings everyone
  back as they were; open invites are withdrawn; released seats stay released.
- The captain alone still sees it: My Crews ("Disbanded · only you can see this") and a restore-only
  crew page — app and web. Everyone else: gone (404).
- Two holes closed with it: joining a CLOSED crew's pool no longer adds the player to the crew (or a
  restore would bring in people who never joined it), and deleting an account skips closed crews
  (a captain who disbanded one would otherwise have been blocked from deleting their account).
- Verified: unit tests, and `scripts/verify-crews-store.ts` 64/64 on production as test accounts.

## 9. Decisions — all settled with Ryan, 2026-10-02

| # | Question | Outcome |
|---|---|---|
| 1 | Record §2's amendments to D1/D2 in the programme? | ✅ **Decided** — all six, with route (2) kept and defined (see below) |
| 2 | Which crew cards light the Activity tab dot? | ✅ **Decided — all three** (seat, invite, save). The existing rule `needsYou.length > 0` stays as is |
| 3 | If someone left or was removed, does joining a crew pool by link put them back in the crew? | ✅ **Decided — no, exits stick.** They play the pool. Left → **Rejoin** themselves from the crew page. Removed → only captain/co-captain can add them back (one Join tap) |
| 4 | Co-captain at save time: required, or optional with a nudge later? | ✅ **Decided — optional.** Skippable row on the save sheet; *"Pick a co-captain"* stays on the crew page until set (for a direct crew, once someone joins). Being made co-captain = one Activity history line, no card. Amends D1's "from day one" |
| 5 | Pending seats inside the pool: a count line, or rows like the mock? | ✅ **Decided — count for everyone, names for the pool admin.** Members see *"9 in · 3 spots saved"*; the admin's Members tab lists who is still pending. Declined seats are not listed. Leaderboard untouched |
| 6 | Crew pools forced Private (never listed in Discover)? | ✅ **Decided — never Public.** Today that means `is_private = true`. Refined the same day: once the strict level exists (see §11), a crew pool can be **Invite link** (default) or **Private** (request to join; crew members skip the queue), never **Public** |
| 7 | Crew bigger than the pool's tier cap (Free 10)? | ✅ **Decided — seats never exceed the cap.** Roster review: *"A Free pool holds 10"* → **Go Plus** or **choose who gets the 9 spots**. Upgrading before first lock re-opens the review. Link joins still hit the cap as today |
| 8 | Email the 253 World Cup admins once at launch? | ✅ **Decided — no email.** But a **thin web slice ships with the RN release** (dashboard save sheet + basic crew page, ~1½ d), because the World Cup was played on web |
| 9 | Captain leaves with no co-captain? | ✅ **Decided — the longest-standing member** (earliest `joined_at`; tie → most crew pools played). One Activity history line for them; the crew page shows *"Captain: Marcus (since Dave left)"*. When the last member leaves, the crew closes: history kept, never shown, no seats |

**Decided so far (2026-10-02):**
- **#1, part:** creating a crew directly stays. Add by exact username or email; added people tap
  *Join* once; captain + co-captain add; non-account emails get one SportPool invite. No friends
  list.
- **#1, rest:** amendments 2–6 confirmed as written (membership widened to *played or accepted*).
- **#2:** all three crew cards light the Activity dot.
- **#4:** co-captain optional, with a standing nudge.
- **#9:** a captainless crew passes to its longest-standing member; when the last member leaves, the
  crew closes.
- **#8:** no email to the World Cup admins. The web dashboard save sheet and a basic crew page ship
  **with** the RN release.
- **#7:** seats never exceed the pool's cap. Go Plus, or choose who gets the spots.
- **#6:** crew pools are never Public, enforced by a CHECK constraint on `pools`, not only by hiding
  the toggle. Today that means `is_private = true`; once the strict level lands, Invite link or Private.
- **#5:** saved spots appear as a count to members; the pool admin sees names of who's still pending.
- **#3:** exits stick. Joining by link doesn't re-add. Leavers can Rejoin themselves; the removed only
  by being added back.

## 10. Not in this plan

- **Run it back** (D2): the crew row makes it cheaper later, but it isn't needed for Crews to work.
- **Suggested crews:** parked 2026-09-28.
- **Crew banter:** banter stays per pool (D1).
- **The `pools` → Crew + Season migration:** not needed, and the question is **closed** *(Ryan,
  2026-10-02)*. Crews sit **beside** today's pools via `pools.crew_id`, and **a pool is a season**.
  The 643 existing pools are untouched until an admin chooses to save one. Anything that must one day
  belong to the crew rather than a pool becomes a column on `crews`: an addition, not a restructure.
- **The join route accepting a bare `pool_id` for private pools:** part of the P1 conversation, but
  any tightening must keep **crew members** able to join their crew's pool from the crew page.

## 11. Settled after the nine — the conflicts Gill surfaced (2026-10-02)

| # | Conflict | Outcome |
|---|---|---|
| 1 | The *Friends list* backlog item contradicts Decision 1 | **Retired** (struck through, not deleted). Its job is done by Crews; finding one person uses the exact lookup, never a list |
| 2 | Decision 5 names three privacy levels; the app has two | **Keep three; build the strict one as its own backlog item** (not in the Crews build). **Public** (Discover) · **Invite link** (today's "Private", relabelled, behaviour unchanged) · **Private** (request to join: the link shows *"Request sent"*, the admin gets *"Sam wants to join · Let in / No"* in Needs you; crew members skip the queue). Crew pools: Invite link (default) or Private, never Public. Close the join route's bare-`pool_id` gap at the same time |
| 3 | Programme items assume a Crew + Season restructure | **Adopted the plan's design and closed the question:** crews sit alongside pools; a pool is a season |
| 4 | The invite email names the captain; Decision 2 says "never in the captain's name" | **Name the captain, once, previewed, from SportPool.** Recorded as a clarification of Decision 2: *invitations name who asked; reminders never do* |

