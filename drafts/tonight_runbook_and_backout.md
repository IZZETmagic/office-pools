# Tonight's runbook + backout — cron fix → read-path flip → off XL

Goal: land the read-path flip (cut egress + CPU) before tomorrow's games. Every
step is independently reversible. The whole read path is behind ONE master flag.

## Design principle: one master switch
Every changed read surface (leaderboard API, entry-analytics API, web pool page/
tabs) checks **`sync_settings.analytics_read_from_columns`** (default `false`).
- `false` → exact current behavior (live compute). `true` → read precomputed columns.
- **Flipping it `false` backs out the ENTIRE read-path change instantly, no deploy.**
Plus per-entry fallback: even with the flag `true`, a null/missing column → that
entry live-computes. So a bad/stale column can never blank a value.

## PRE-FLIGHT — capture the current good state (do FIRST, before any change)
Record so we can restore exactly:
- [ ] Current production deployment URL/SHA (`vercel ls office-pools --prod | head -1`) — the rollback target.
- [ ] Current compute tier (XL) — the re-upgrade target.
- [ ] Current flag values:
  `SELECT setting_key,setting_value FROM sync_settings WHERE setting_key IN ('analytics_read_from_columns','analytics_sweep_enabled','sync_enabled');`
- [ ] Confirm no live match + DB calm + funnel cleared before starting.

## EXECUTION ORDER (each step verified before the next)
1. **Deploy all code behind flags** (cron fix active; read flip flag-gated OFF).
   - Because the read flag is OFF, this deploy is **zero behavior change**. If the
     deploy itself misbehaves → **Vercel instant rollback** (below).
2. **Verify cron fix** — watch a few cron runs: watermark advances over completed
   work, `pools_succeeded`/`capped_more` sane, no errors.
3. **Re-backfill** the stale pools (heals the 106) → confirm 0 stale via the compare script.
4. **Flip read flag ON** → `UPDATE sync_settings SET setting_value='true' WHERE setting_key='analytics_read_from_columns';`
5. **Parity canary** — compare API output + spot-check the app vs known-good values.
6. **Watch egress + response times** for a bit.
7. **(Separate, gated) drop XL → Medium** — only after 4–6 look clean; keep XL re-upgrade ready.

## BACKOUT — fastest first

### 🔴 Panic button (read path looks wrong: bad numbers, blank tabs)
```sql
UPDATE sync_settings SET setting_value='false' WHERE setting_key='analytics_read_from_columns';
```
Instant, no deploy. Every surface reverts to live compute on the next request.
This is the primary backout and covers the entire M4 flip.

### Cron misbehaving (wrong/stale columns, errors, runaway)
```sql
UPDATE sync_settings SET setting_value='false' WHERE setting_key='analytics_sweep_enabled';  -- stop it writing
-- or fully remove the job:
SELECT cron.unschedule('analytics-sweep');
```
Safe because columns are only read when the read flag is ON — and if the cron is
off, flip the read flag off too (panic button) so live-compute serves fresh data.

### Bad deploy (build broke something, unexpected runtime error)
**Vercel instant rollback** — promote the previous deployment (no rebuild):
`vercel rollback <previous-prod-url>`  (or "Promote to Production" on the prior
deployment in the dashboard). Faster than git revert. Then `git revert <sha>` to
keep the repo honest.

### Caching misbehaving (stale/incorrect cached responses)
Disable the cache tag / set revalidate to 0 (or flip read flag off → bypasses the
cached read path). Reads stay cheap (columns) even without caching.

### Compute downgrade went wrong (Medium can't hold load)
Re-upgrade Medium → XL in the dashboard (~2 min restart). Ensure read flag is ON
(that's what makes Medium viable). Existing emergency brake remains:
`UPDATE sync_settings SET setting_value='false' WHERE setting_key='sync_enabled';`

## BACKOUT DECISION CRITERIA (when to pull the panic button)
- Users report (or we see) wrong XP/levels/form, or blank analytics, on the app.
- Parity canary shows non-trivial mismatches (beyond the known <60s live lag).
- API 5xx rate climbs or response times regress after a flag flip.
- Egress/CPU do NOT drop after the flip (means it's not doing what we expect).

## POST-BACKOUT VERIFICATION (after any backout)
- Site 200 + normal response times.
- Leaderboard/form tab show correct values (live compute).
- No 5xx in api_perf_log.
- Note what happened in this file + the precompute memory doc; do not retry the
  same step without understanding the failure.

## What is NOT reversible (so be careful)
- Nothing destructive here: we only ADD columns / write to them / read with
  fallback. No data is deleted, no schema dropped. The backfill overwrites
  analytics columns but those are unread unless the flag is on. Worst realistic
  case = flip the master flag off and we're exactly back to today's behavior.
