# XL → Medium downgrade — staged runbook (execute in the post-final calm window)

**Prepared:** 2026-07-12 · **Do NOT execute during the WC knockouts.** All steps below are staged for the calm window after the final (match load collapses, minimal write traffic).

## Live-state discovery (2026-07-12, verified against prod `sync_settings`)

Phase B is **already 2/3 done in production** — this differs from the roadmap/memory, which described the *code default* (off), not the live value:

| Flag | Code default | **Live prod value** | Meaning |
|---|---|---|---|
| `pool_cache_enabled` | false | **true (ON)** | biggest egress lever — already live |
| `scoring_diff_writes_enabled` | false | **true (ON)** | change-only scoring writes — already live |
| `sweep_time_box_enabled` | false | **absent → off** | crash-fix (time-boxed resumable sweep) — the one flag left |

> ⚠️ Confirm with Ryan whether `pool_cache_enabled` / `scoring_diff_writes_enabled` being ON is intended & stable (vs. flipped for a test). If intended, Phase B is nearly complete.

## Remaining steps

### Phase B (finish) — flip the last flag
```sql
insert into sync_settings (setting_key, setting_value) values ('sweep_time_box_enabled', true)
on conflict (setting_key) do update set setting_value = true;
```
- This is the crash-prevention flag (time-boxed, resumable sync sweep). Safe to flip; could even go before the final if sweep-crash risk is a concern. Verify one sync cron run completes cleanly afterward.
- Rollback: `... do update set setting_value = false;`

### Phase C — the downgrade (XL/4-core → Medium)
Prereqs (verify all in the calm window, off a live match):
1. `pool_cache_enabled` + `scoring_diff_writes_enabled` confirmed ON and behaving (already true as of 2026-07-12).
2. `auth_rls_initplan` advisor = 0 (Phase A RLS wrapping applied 2026-06-30 — re-check `get_advisors(type: performance)`).
3. Leaderboard read path holds (note: the M4 read-path flip is NOT started — leaderboard still recomputes per-read; watch CPU on the first Medium match day, or land precompute first for headroom).
4. Downgrade via Supabase dashboard (compute add-on) — project `ujthamlehjyubbzxbnes`.

Watch after downgrade: CPU headroom on a live-ish window, egress, replication lag. Rollback = bump compute back to XL (reversible, ~minutes).

### Phase D — durable (separate track)
Consumes the leaderboard-precompute read-path flip + per-pool realtime broadcast. Not required for the downgrade itself; it's what makes Medium comfortable at Showdown/EPL scale.

## Sequencing vs. the tournament
- **During knockouts (now):** nothing here. Leave as-is.
- **Post-final calm window:** Phase B last flag → verify → Phase C downgrade → watch graphs.
