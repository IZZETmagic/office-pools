# Retired edge functions — do not redeploy

Retired **2026-10-05**. Each of the five functions below is still deployed, but its live source is now a
stub that answers `410` and does nothing — no reads, no writes, no sends. These files are the code that
ran before, kept as a **record**, not for restoring. The `.ts.retired` extension keeps every tool —
`tsc`, eslint, vitest, `supabase functions deploy` — from picking them up.

## Why

All five ran with the **service-role** key, never checked who called them, and sat behind
`verify_jwt = true` — which the **public anon key satisfies**. That key ships to every visitor of the
website and the app, so anyone could trigger them, as often as they liked. None was in git; the deployed
copy was the only one.

| Function | Last live version | What anyone holding the public key could do |
|---|---|---|
| `send-weekly-recap` | v5, 2026-03-09 | Email every member of every `open` pool — 21 people across 20 pools on 2026-10-05, most of the user base during the World Cup. No dedup, no limit; quoted dead-legacy `total_points` and `current_rank` |
| `send-match-results` | v5, 2026-03-09 | Email results for any match **and overwrite `pool_entries.previous_rank`** across the tournament's pools, on a hard-coded 3/1 points scale that is not the real one |
| `send-deadline-reminders` | v4, 2026-02-27 | Email every un-submitted member of any pool whose deadline is 24–25 h away |
| `send-round-deadline-reminders` | v3, 2026-03-09 | The same, for progressive-round deadlines |
| `send-countdown-retry` | v1, 2026-04-11 | Email 23 hard-coded members *"N days until the World Cup"* — after kickoff, a **negative** N, for a tournament already over |

## The rule they broke

**We do not mass-send notifications to users for past events** (Decision 16 in `SPORTPOOL_PROGRAMME.md`).
`send-countdown-retry` broke it by design. The others broke it the moment anyone invoked them outside
the window they were written for, and `send-match-results` would have broken it on its own had its
trigger been re-enabled — see below.

## Loose ends, deliberately left

- **`on_match_completed`** on `public.matches` still points at `send-match-results`. It is **disabled**
  (`tgenabled = 'D'`). If anyone re-enables it, it now reaches the stub rather than mass-sending results
  for past matches.
- **Two functions with the same exposure are still live**, because live crons call them: `auto-submit`
  (`auto-submit-and-archive`, daily) and `send-countdown-emails` (`countdown-emails`, daily). Not part of
  this retirement — they need either a vault-sourced secret check or removal.
- **`send-countdown-retry`'s 23 hard-coded member addresses are not in this archive.** They are personal
  data and were left out when the source was transcribed; everything else is as it ran.
- To finish the job, **delete all five from the Supabase dashboard** (Edge Functions). There is no
  delete through the MCP tooling used here, and the CLI is not installed on this machine.
