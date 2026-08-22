# Match detail header — goal scorers + red-card indicator

**Status:** Planned, NOT built (Ryan wants to build later). Written 2026-07-14.
**Surface:** mobile only — `mobile/app/match/[matchId].tsx` `MatchHeader`.

## Desired UX (confirmed via mock 2026-07-14)

Below the teams / score / clock in the header:

```
        🇫🇷 France     1 – 2 ▐     Spain 🇪🇸
        ⚽ Doué 42'                Olmo 44' ⚽
                                  Lamal 66' ⚽
```

- **Goals:** two columns under the score. Home team's goals **left-aligned**, away
  team's goals **right-aligned**. Each row = large soccer-ball icon + scorer surname
  + minute. Own goals marked `(OG)`, penalties `(P)` (optional polish).
- **Red cards:** a red **rounded vertical rectangle** in the gap between the team
  flag and the score, tucked **closer to the score**, on the carded team's side
  (left of score = home carded, right of score = away carded). One bar per red card.
- Icon: use Hugeicons `FootballIcon` (already bundled via `@hugeicons/react-native`;
  see `mobile/components/ui/Icon.tsx`). "Huge" = size it up (~20–24px).

## Data reality (verified 2026-07-14 — don't re-investigate)

- **Goal scorers (name + minute): NOT stored anywhere.** The sync already fetches
  `/fixtures/events` every minute for live/recently-completed matches
  (`app/api/cron/sync-fixtures/route.ts` ~L237) but passes them only to
  `eventsToConduct` (`lib/integrations/apiFootball/mappers.ts`), which aggregates
  **card counts** into `match_conduct`. Goal events are discarded.
- **Red cards: per-team COUNTS exist** in `match_conduct`
  (`yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards`,
  keyed `match_id,team_id`). Total reds = `indirect_red_cards + direct_red_cards +
  yellow_direct_red_cards`. No minute/player — but the indicator only needs a count.
  Populated for all played matches (it drives fair-play scoring).
- `MatchStatsResponse` (`/api/matches/[match_id]/stats`) is prediction crowd-stats
  only — no events.
- api-football event shape already typed: `ApiFootballEvent`
  (`lib/integrations/apiFootball/types.ts`) — `time.{elapsed,extra}`, `team`,
  `player.name`, `type` ('Goal'|'Card'|'subst'|'Var'), `detail`.

## Part A — Red-card indicator (cheap: mobile-only, NO deploy, works on past matches)

1. `mobile/lib/useMatchDetail.ts` — add a `match_conduct` fetch in `load()`
   (`select team_id, indirect_red_cards, direct_red_cards, yellow_direct_red_cards
   where match_id = ...`). Reduce to a per-team red count; store in state (or hang
   `homeReds`/`awayReds` off the returned object).
2. Realtime: the existing per-match channel is on `matches` only. A red card also
   bumps nothing on `matches`, so either (a) also subscribe to `match_conduct` for
   this match, or (b) re-fetch conduct when the `matches` UPDATE fires (simpler,
   good enough — a red usually coincides with other match changes).
3. `MatchHeader` — render N red bars (rounded vertical rect, ~9×22, `#EF4444`)
   between flag and score on the carded side, closer to the score.

## Part B — Goal scorers (needs table + backend + deploy + backfill)

1. **Migration — new `match_events` table** (display timeline; leave `match_conduct`
   untouched for scoring):
   - `event_id uuid pk`, `match_id uuid`, `team_id uuid` (team **credited** — for own
     goals this is the OPPONENT of the scorer), `kind text` ('goal'|'own_goal'|
     'penalty'), `player_name text`, `minute int`, `extra_minute int null`,
     `created_at/updated_at/last_synced_at`.
   - Idempotency: api-football events have no stable id. Simplest robust approach =
     **replace-all-for-match each sync** (delete this match's rows, insert current
     set) — the set is tiny (a handful of rows). Alternatively upsert on
     `(match_id, team_id, player_name, minute, kind)` + delete stale.
2. **Backend mapper** — add `eventsToGoals(fixture, events, matchId, {teamIdByExternal})`
   in `mappers.ts`:
   - Keep `type === 'Goal'` AND `detail !== 'Missed Penalty'` (exclude missed pens).
   - `kind`: `detail === 'Own Goal'` → `own_goal`; `detail === 'Penalty'` → `penalty`;
     else `goal`.
   - Credited team: own goal → the OTHER team; else `event.team`. Map via
     `teamIdByExternal`. `player_name = ev.player.name`, `minute = ev.time.elapsed`,
     `extra_minute = ev.time.extra`.
3. **sync-fixtures route** — reuse the `evts` array already fetched for conduct
   (~L237); compute goal rows and replace-all into `match_events` (same live/recent
   guard as conduct).
4. **Deploy** to Vercel (Ryan controls) — goal data only flows after this.
5. **Backfill** — one-off `scripts/backfill-match-events.ts`: for each completed
   match with `external_match_id`, fetch `/fixtures/events`, write `match_events`.
   Respect api-football quota (sequential + small delay). Run once so past matches
   show their goals (without it, only future live matches populate).
6. **Mobile** — `useMatchDetail` fetches `match_events` (order by minute); add to
   state. Re-fetch on the `matches` UPDATE realtime event (a goal bumps the score →
   fires that event), or add a `match_events` subscription.
7. **`MatchHeader` UI** — render the two goal columns (home-credited left, away
   -credited right), sorted by minute, `FootballIcon` + surname + `minute'`, with
   `(OG)`/`(P)` suffixes.

## Edge cases / risks

- Own goals: attribute to the benefiting team, mark `(OG)`.
- Penalties `(P)` vs **missed** penalties (exclude — same `type:'Goal'`, detail
  'Missed Penalty').
- VAR-disallowed goals: on re-sync the event vanishes → replace-all handles it.
- Surname vs full name: api-football `player.name` is usually full — may want to
  take the last token for width in the narrow header.
- Live updates during play (Part B step 6).
- **Product note:** goal-by-goal detail nudges the app toward "score tracker"
  territory (cf. the "predictions app, not a score tracker" principle). Deliberate
  call — fine, just noting it.

## Effort (rough)

- Part A (reds): ~half a day, mobile-only, no deploy.
- Part B (goals): ~1.5–2 days incl. migration, mapper, sync, backfill, mobile, UI,
  deploy.

## Related (already shipped 2026-07-14, same header)

Live clock work in this header: `mobile/lib/useMatchClock.ts` (MM:SS estimate) +
`useHomeData`/`useTournamentMatches`/`useMatchDetail` carry `live_added`;
backend captures `fixture.status.extra` → `matches.live_added` (migration applied;
**backend deploy still pending** to populate stoppage/goal data).
