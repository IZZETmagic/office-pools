# The read path is the product's cost

**A review of everything built for Premier League + Showdown, before it carries load.**

Date: 2026-08-31 · Status: FOR REVIEW · Author: session review at Ryan's request

---

## Why this document exists now

`pg_stat_statements` puts **every `league_*` statement at 0.01% of 354 hours** of accumulated
database time. The World Cup is essentially the other 100%.

That is the whole argument for doing this today. The league code has never been under load, so
nothing here is on fire — and the World Cup is a complete, *measured* record of what this shape of
product costs when 3,652 people use it at once. We are not guessing what will go wrong. We have the
receipts.

This is the last cheap moment. Every fix below is a refactor today and an incident in April.

---

## 1. What the World Cup actually cost

Top statements by share of total database time, from `pg_stat_statements` on 2026-08-31:

| Share | Statement | Calls | ms/call | What it is |
|------:|-----------|------:|--------:|------------|
| 19.9% | `SELECT wal->>… ` | 14,171,580 | 17.9 | Realtime WAL decoding |
| 18.2% | `SELECT "predictions".*` | 5,858,858 | 39.6 | **Select star** |
| 8.7% | `SELECT "match_scores".*` | 8,389,931 | 13.3 | **Select star** |
| 7.3% | `SELECT "predictions".*` | 1,035,468 | 89.6 | **Select star** |
| 5.1% | `SELECT "predictions".*` | 6,861,920 | 9.5 | **Select star** |
| 5.1% | `SELECT wal->>… ` | 6,054,313 | 10.8 | Realtime WAL decoding |
| 4.9% | `pool_entries` + `row_to_json(pool_members)` | 123,783 | **503.2** | PostgREST embedding |
| 2.5% | `row_to_json(pool_members)` | 72,064 | **447.9** | PostgREST embedding |

Which collapses to **three** causes, not eight:

| Cause | Share of all DB time |
|-------|---------------------:|
| **Realtime WAL decoding** — `postgres_changes` replicating row events | **25.0%** |
| **`SELECT *`** on `predictions` and `match_scores` — 22.1M calls | **39.3%** |
| **PostgREST resource embedding** — 0.45–0.50 s per call | **7.4%** |

**71.7% of everything, in three patterns.** Not architecture. Not volume. Three habits.

> ⚠ Read the third row again. A single `pool_entries` query with a `pool_members` embedding costs
> **half a second of database time per call**. That is not a slow query, it is a query that should
> not exist in that shape.

---

## 2. Did we repeat them? — three checks, three answers

### ✅ `SELECT *` — not once

Zero occurrences of `select('*')` or `select()` anywhere in `lib/league/`. Every read names its
columns. The single largest World Cup cost is **not** present in the league code.

### ✅ `postgres_changes` — not for league

No `league_*` table is in the `supabase_realtime` publication. League realtime went
Broadcast-from-database from the start (migrations 060, and now 125 for fixtures). The 25% line item
does not grow when league traffic grows.

⚠ **But it has not shrunk either.** Ten tables are still replicated, and each one costs WAL decoding
per subscriber per row:

`user_pending_actions` (37,747 rows) · `pool_entries` (5,037) · `pool_members` (4,861) ·
`pool_messages` (4,626) · `user_presence` (4,042) · `pool_round_states` (1,961) ·
`pool_message_reactions` (219) · `matches` (104) · `user_activity` · `pool_pinned_messages`

Five live consumers remain, four of them mobile: `mobile/lib/usePoolEntries.ts`,
`usePoolDetail.ts`, `useMemberRoster.ts`, `HomeDataProvider.tsx`, plus
`components/presence/PresenceProvider.tsx`. Web is clean — `PoolDetail.tsx`'s only mention is the
comment explaining what it replaced.

### ⚠ PostgREST embeddings — three, all in `notify.ts`

```
lib/league/notify.ts:85,392,499
  .select('user_id, users!inner(email, username, full_name), pool_entries(entry_id, entry_name)')
```

Same shape as the 0.5 s/call World Cup statement. These run on **cron and notification paths**, not
page loads, so the blast radius is small — but they run per pool per notification, and Showdown's
notification ecosystem is not built yet. Fix before it is.

---

## 3. What we *did* repeat

### 3.1 🔴 The whole season, on every request, per viewer, uncached

`readLeaguePoolView` pages through **all 380 fixtures of the season** on every league pool page
load. Measured as JSON:

| Read | Size |
|------|-----:|
| `league_fixtures` — whole season | **175 kB** |
| `league_matchweeks` | 9.5 kB |
| `league_standings` | 8.3 kB |
| `league_clubs` | 3.9 kB |

One matchweek is **~4.6 kB**. We move 175 kB regardless of which tab is open.

Three things make it worse than the number suggests:

1. **It is called with the user client**, so RLS evaluates on all 380 rows, every load.
2. **It is outside the cache.** `page.tsx` calls `readLeaguePoolView` directly, *not* through
   `getPoolDataCached`. The `pool_cache_enabled` switch does not cover it.
3. **The page is `force-dynamic`.** Correct for a per-user page — but it means nothing about this
   read is ever reused, even between two members of the same pool loading the same season one
   second apart.

To be fair to it: the Fixtures and Results views legitimately need the full season, the read is
correctly paged, and every column is named. The waste is not *what* it reads — it is that it reads
it **per request, per viewer, uncached, through RLS, whichever tab is open.**

### 3.2 🔴 Aggregates computed off the database

`lib/league/duels.ts:122` — `readMatchweekPoints` pulls `league_match_scores` rows to Node and sums
them in a `for` loop. This is the exact pattern migration 124 was written to avoid, and its own
header says so:

> *"the scoring architecture rule settled this on 2026-07-29: aggregates belong in SQL."*

We wrote the rule down in one migration and broke it in the file next door.

### 3.3 🔴 One number, two implementations

`DuelsTab.tsx:228` — `buildDuelTable` computes the W/D/L standings **in every browser, on every
render**, from raw duel rows. And it carries this fallback:

```ts
r.pts = enginePoints?.get(r.entry) ?? r.w * DUEL_WIN + r.d * DUEL_TIE
```

That right-hand side is a **second scoring engine**, in TypeScript, in the browser. Migration 121
made `league_score_duels` the owner of that arithmetic. This line is exactly the divergence the
architecture rule exists to prevent, and it is one bad `duelPoints` read away from two screens
disagreeing about the same number — which has already happened once on this project
(`readEntryTotals`' own comment records it).

`DuelsTab` has **28 `useMemo` blocks**. Verdicts, form, streaks, movement, best-call, season series
— all derived in the browser from rows shipped for that purpose.

### 3.4 🟠 Unbounded reads with a dated fuse

36 reads in `lib/league/` have no `.range()` or `.limit()`. Most are inherently small — 20 clubs, 38
matchweeks — and are fine. Two are not:

| Read | Rows | Silently truncates at |
|------|------|----------------------|
| `readPoolDuels` (`duels.ts:59`) — every duel in a pool | `ceil(n/2) × 38` | **~53 members** |
| `readMatchweekPoints` (`duels.ts:133`) — one matchweek | `n × 10` | **100 members** |

Neither errors at the cap. They return exactly 1,000 rows and the UI renders a plausible, wrong
answer — the failure mode recorded in `supabase_postgrest_row_cap`. The World Cup's biggest pool had
192 entries. Both of these break well below that.

### 3.5 🟠 Nothing is cached, and the payload forbids the obvious fix

There is no `unstable_cache`, `revalidate`, or cache tag anywhere in `lib/league/`. And the caching
memo from 2026-07-26 already ruled out the reflexive answers: CDN caching is useless for pool detail
(median pool = 1 member ⇒ ~0% hit rate), and the 3.8 MB World Cup pool payload exceeds Vercel Runtime
Cache's 2 MB item cap.

That conclusion still holds — **but it was reached about a per-pool payload.** The 175 kB of fixtures
is not per-pool. It is per **season**, shared by every pool playing it, and it changes only when the
feed writes. That is a different object with different economics, and §6 is about exactly that.

---

## 4. The rule, made checkable

The architecture rule (settled 2026-07-29) says the backend computes and stores once, frontends only
display, aggregates happen in SQL, and updates are pushed not polled. It has been honoured by the
*engine* and quietly ignored by the *read path*, because as written it is a principle, not a test.

Four questions that can actually be answered about a diff:

> **1. Is this number stored, or is it being worked out?**
> If a component computes it, the engine should have written it. One owner per number.
>
> **2. Does this read name its columns, and can it name fewer rows?**
> `SELECT *` is banned outright. "The whole season" needs a reason beyond "it was easier".
>
> **3. What is the row count at 200 members, week 38?**
> If the answer is over 1,000 and there is no `.range()`, it is already broken — it just has not
> happened yet.
>
> **4. Is this read per-user, or per-pool, or per-season?**
> Per-season data read per-user is the most expensive mistake available, and the easiest to fix.

---

## 5. The work

Ordered by cost avoided per hour spent. Sizes are estimates.

| # | Change | Size | Why |
|---|--------|-----:|-----|
| **1** | `.range()` on `readPoolDuels` + `readMatchweekPoints` | 1 h | Two dated bombs. Silent wrong answers, not errors |
| **2** | `league_matchweek_points()` in SQL; delete the Node loop | 2 h | The rule, applied where we broke it |
| **3** | Duel standings from the engine — kill the `?? w*500+d*250` fallback | 3 h | Removes the second scoring engine |
| **4** | Cache the season read (§6) | 4 h | 175 kB × every load × every viewer → once per feed write |
| **5** | Scope `readLeaguePoolView` to the tab that needs it | 4 h | Duel tab needs 1 matchweek, not 38 |
| **6** | Replace the 3 `notify.ts` embeddings with explicit joins | 2 h | 0.5 s/call, before Showdown notifications ship |
| **7** | Retire the 5 remaining `postgres_changes` consumers | 2 d | 25% of DB time; needs a mobile OTA |

**Items 1–3 are the ones I would do before Premier League opens.** They are 6 hours and they are the
difference between "correct" and "correct until somebody starts a 60-person pool".

---

## 6. Caching — the one place it genuinely applies

Not the pool payload. The **season**.

Fixtures, clubs, matchweeks and standings are:

- identical for every viewer and every pool on that season,
- ~197 kB together — comfortably inside the 2 MB Runtime Cache item cap,
- and changed by exactly one writer: `league_apply_fixture_sync`.

So the shape is:

```
unstable_cache(readSeasonView, ['league-season', seasonId], { tags: [`league-season:${seasonId}`] })
      ↑ every pool on the season shares one entry
revalidateTag(`league-season:${seasonId}`)   ← called from the sync, on `changed.length > 0`
```

⚠ **Invalidation must hang off the sync's own `changed` array, not a TTL.** A TTL either serves a
stale score during a match — breaking the live-standings guarantee outright — or is short enough to
be pointless. `league_apply_fixture_sync` already returns exactly which fixtures moved (105); that
return value is the invalidation signal, already computed, currently unused for this.

⚠ **The live half must not go through the cache.** Migration 125 already carries score, status and
minute over the broadcast. The cached object should hold the *stable* season — who plays whom, when,
where — and let the broadcast own everything that moves. Caching what moves is how you end up
serving a 0–0 through a goal.

**What we should still not cache:** the per-pool, per-user payload. The 2026-07-26 finding stands —
median pool is 1 member, so there is no one to share it with.

---

## 7. How we would know it worked

Guards, not vigilance. This codebase has a good record of turning a lesson into a test
(`verify-select-columns.ts`, `denyAllTables.guard.test.ts`), and a poor record of remembering rules
that live only in a document.

1. **A lint-level guard** that fails on `select('*')` and on `.eq('pool_id', …)` without `.range()`
   in `lib/league/`. Both are mechanically detectable.
2. **Extend `scripts/verify-read-paths.ts`** with a league branch that asserts row counts per page
   load against a seeded 60-member pool — the size where §3.4 breaks.
3. **Re-run the `pg_stat_statements` table in §1 after Premier League's first full matchweek.**
   If `league_*` is not the top line by then, nothing has gone wrong. If it is, this document says
   where to look.

---

## Appendix — measurement commands

```sql
-- §1: the cost table
select left(regexp_replace(query,'\s+',' ','g'),105) as statement,
       round((100*total_exec_time/sum(total_exec_time) over ())::numeric,1) as pct_db_time,
       calls, round((total_exec_time/nullif(calls,0))::numeric,2) as ms_per_call
  from pg_stat_statements order by total_exec_time desc limit 8;

-- §2: what is still replicated for postgres_changes
select tablename from pg_publication_tables where pubname = 'supabase_realtime';

-- §3.1: bytes on the wire for one season read
select pg_size_pretty(length((select jsonb_agg(to_jsonb(x))::text from (
  select fixture_id, matchweek_id, fixture_number, home_club_id, away_club_id, kickoff_at,
         venue, status, home_goals, away_goals, is_completed, live_minute, live_period, live_added
    from league_fixtures where season_id = '<season>') x))::bigint);
```
