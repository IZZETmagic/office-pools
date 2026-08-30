// =============================================================
// Moving the table deadline — the rule, and the reveal it depends on
// =============================================================
// Table mode's deadline is the only genuine deadline decision in the product.
// One prediction rides on it, no fixture list enforces it, and migration 104
// settles who may move it:
//
//   A table deadline can always be moved to a FUTURE instant.
//   It can never be moved to a PAST one.
//   Once the tables are REVEALED, it cannot be moved at all.
//
// The three scenarios that produced that rule (104's header has them in full):
//
//   1. pool before the season, everyone files, deadline passes, all revealed
//   2. pool mid-season, everyone files — same, and needs no special handling
//   3. SOMEBODY FORGETS. The admin moves the deadline forward, which reopens
//      the table for everyone and tells the whole pool.
//
// Scenario 3 is why the REVEAL had to stop being "the deadline passed". Those
// were one expression — `now() >= pools.league_table_lock_at` did both the
// write lock and the RLS read gate — so the moment a deadline passed with a
// straggler outstanding, every member could read every rival's table, and the
// admin's extension then handed them all a fresh edit. This file guards that
// the two never collapse back into one.
//
// The behavioural half needs a database and belongs in a verify script. This is
// the always-on half: it proves the structural guarantees are still in the
// migration and that the copy has not drifted back to promising a frozen
// deadline.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { leagueTableDeadlineMovedTemplate } from '@/lib/email/templates'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

/**
 * The same file with whole-line comments removed.
 *
 * ⚠ NEEDED FOR EVERY "must not contain" ASSERTION, and the reason is not
 * incidental. This codebase explains a change by QUOTING the code it replaced —
 * 104's header prints the old `now() >= po.league_table_lock_at` policy, the
 * route's header prints the old `.catch(() => {})`, SettingsTab's prints the old
 * `toISOString().split('T')[0]`. Asserting `not.toMatch` against the raw file
 * therefore fails on the very comment that documents the fix, which would leave
 * two options, both bad: delete the explanation, or delete the test.
 *
 * Only WHOLE-LINE comments go. A trailing `// ...` on a line of code is left
 * alone, so a `https://` inside a string is never mistaken for one.
 */
const codeOnly = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trim()
      return !(
        t.startsWith('--') || t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
      )
    })
    .join('\n')

const migration = read('lib/migrations/104_the_deadline_moves_forward_the_reveal_is_its_own_switch.sql')
const route = read('app/api/pools/[pool_id]/table-deadline/route.ts')
const settings = read('app/pools/[pool_id]/admin/SettingsTab.tsx')
const notify = read('lib/league/notify.ts')
const m109 = read('lib/migrations/109_the_deadline_reveals_everyone.sql')
const m110 = read('lib/migrations/110_the_deadline_is_the_only_switch.sql')
const m114 = read('lib/migrations/114_the_deadline_reopens.sql')
const page = read('app/pools/[pool_id]/page.tsx')
const detail = read('app/pools/[pool_id]/PoolDetail.tsx')

const DEADLINE = '2026-09-04T19:00:00.000Z'

// =============================================================
describe('migration 104 — the deadline guard', () => {
  it('refuses a deadline set in the past', () => {
    expect(migration).toMatch(/NEW\.league_table_lock_at <= now\(\)/)
    expect(migration).toMatch(/cannot be set in the past/i)
  })

  it('⚠ SUPERSEDED BY 109 — 104 allowed reopening a passed deadline', () => {
    // Kept as history, and asserted against 104's FILE rather than production.
    // 104 deliberately dropped the `now() >= OLD.league_table_lock_at` guard so
    // an admin could reopen for a straggler. 109 put it back, because once the
    // reveal rides on the clock, "the deadline passed" and "everyone has seen
    // everyone" become the same instant. The 109 block below is what is live.
    expect(codeOnly(migration)).not.toMatch(/now\(\)\s*>=\s*OLD\.league_table_lock_at/)
  })

  it('freezes the deadline on the REVEAL, not on the clock', () => {
    expect(migration).toMatch(/IF OLD\.league_table_revealed_at IS NOT NULL THEN/)
  })

  it('makes the reveal set-once', () => {
    // A reveal cannot be taken back: the members have already read each other's
    // tables, and moving a timestamp does not un-read them.
    expect(migration).toMatch(
      /OLD\.league_table_revealed_at IS NOT NULL\s*\n\s*AND NEW\.league_table_revealed_at IS DISTINCT FROM OLD\.league_table_revealed_at/,
    )
  })

  it('keeps league_mode immutable', () => {
    expect(migration).toMatch(/league_mode is fixed at pool creation/)
  })
})

// =============================================================
// ⚠ 104's reveal-stamp block is GONE, not disabled. It asserted the shape of
// `league_table_revealed_at`, which migration 110 dropped: once 109 removed the
// everybody-has-filed hold, the stamp recorded nothing the deadline did not
// already say, and in production it lagged the deadline by 15 minutes because it
// was written on the first page load afterwards. What 104 got right and 110
// keeps — the ADMIN read gate — is asserted in the 110 block below.
// =============================================================
describe('migration 104 — what survived it', () => {
  it('an admin still cannot read rivals\' tables before the deadline', () => {
    // 078's admin policy had NO gate: a playing admin could read every rival's
    // table through the API while the window was open, and TableEntryModal
    // refusing it in the component is not a gate. This is the one part of 104
    // that is not reverted.
    expect(migration).toMatch(/DROP POLICY IF EXISTS "Pool admins can view all table predictions"/)
    expect(m110).toMatch(/CREATE POLICY "Pool admins can view all table predictions after the lock"/)
    const adminPolicy = m110.slice(
      m110.indexOf('CREATE POLICY "Pool admins can view all table predictions after the lock"'),
    )
    expect(adminPolicy).toMatch(/is_pool_admin\(pm\.pool_id\)/)
    expect(adminPolicy).toMatch(/now\(\) >= po\.league_table_lock_at/)
  })

  it('an admin can still count who has filed without seeing what they filed', () => {
    // league_table_filing_status is NOT part of the reveal and is kept by 110.
    expect(m110).not.toMatch(/DROP FUNCTION IF EXISTS public\.league_table_filing_status/)
    const status = migration.slice(migration.indexOf('FUNCTION public.league_table_filing_status'))
    const body = status.slice(0, status.indexOf('COMMENT ON FUNCTION'))
    expect(body).toMatch(/has_filed boolean/)
    expect(body).not.toMatch(/\bclub_id\b/)
    expect(body).not.toMatch(/predicted_position/)
  })
})

// =============================================================
describe('migration 110 — the deadline is the only switch', () => {
  it('puts both read policies back on the clock', () => {
    expect(m110).toMatch(/CREATE POLICY "Members can view all table predictions after the lock"/)
    expect((m110.match(/now\(\) >= po\.league_table_lock_at/g) ?? []).length).toBe(2)
    expect(codeOnly(m110)).not.toMatch(/league_table_revealed_at IS NOT NULL/)
  })

  it('drops the stamp, its index, and both reveal functions', () => {
    expect(m110).toMatch(/DROP FUNCTION IF EXISTS public\.league_reveal_table_if_ready\(uuid\)/)
    expect(m110).toMatch(/DROP FUNCTION IF EXISTS public\.league_sweep_table_reveals\(\)/)
    expect(m110).toMatch(/DROP INDEX IF EXISTS pools_table_awaiting_reveal_idx/)
    expect(m110).toMatch(/ALTER TABLE pools DROP COLUMN IF EXISTS league_table_revealed_at/)
  })

  it('drops the column LAST, after the policies and the trigger', () => {
    // Policies carry a real dependency on the column, so an early DROP would
    // need CASCADE and would take them with it. And plpgsql resolves column
    // names at RUN time (the 081 -> 082 lesson), so a trigger still naming the
    // column would create cleanly and fail on the first pool UPDATE.
    const dropCol = m110.indexOf('ALTER TABLE pools DROP COLUMN')
    expect(m110.indexOf('CREATE POLICY "Members can view all table predictions after the lock"')).toBeLessThan(dropCol)
    expect(m110.indexOf('CREATE OR REPLACE FUNCTION public.enforce_league_mode_immutable')).toBeLessThan(dropCol)
  })

  it('keeps the deadline final — the last thing freezing it', () => {
    // The reveal-stamp backstop goes with the stamp, so this clause is now
    // alone. Without it an admin could move a passed deadline and re-hide
    // tables the pool has already read.
    expect(m110).toMatch(/IF now\(\) >= OLD\.league_table_lock_at THEN/)
    expect(m110).toMatch(/It cannot be reopened/)
  })

  it('keeps every non-reveal guard', () => {
    expect(m110).toMatch(/league_mode is fixed at pool creation/)
    expect(m110).toMatch(/cannot be set in the past/)
    expect(m110).toMatch(/NEW\.table_deadline_reminder_sent_at := NULL/)
  })

  it('leaves no reveal stamp anywhere in the app', () => {
    for (const src of [page, detail, settings, route]) {
      expect(codeOnly(src)).not.toMatch(/league_table_revealed_at/)
      expect(codeOnly(src)).not.toMatch(/revealedAt/)
    }
  })

  it('derives isRevealed from the deadline, with no second write', () => {
    expect(page).toMatch(/const isRevealed = isLocked/)
    expect(codeOnly(page)).not.toMatch(/league_reveal_table_if_ready/)
  })
})

// =============================================================
// Migration 109 is where the LIVE deadline rule is. 104 and 107 above are the
// history that produced it, and two of their assertions are marked superseded.
// =============================================================
describe('migration 109 — the deadline reveals everyone', () => {
  it('reveals on the deadline alone, with no hold', () => {
    const fn = m109.slice(m109.indexOf('FUNCTION public.league_reveal_table_if_ready'))
    const body = fn.slice(0, fn.indexOf('COMMENT ON FUNCTION'))
    // 104's hold. Its absence is the whole migration.
    expect(codeOnly(body)).not.toMatch(/v_total > 0 AND v_filed < v_total/)
    expect(codeOnly(body)).not.toMatch(/not everyone has filed/)
    // The clock is the only remaining condition.
    expect(body).toMatch(/v_lock_at IS NULL OR now\(\) < v_lock_at/)
  })

  it('still reports how many members the deadline caught', () => {
    // The counts are no longer a gate, but a reveal that cannot say who it left
    // behind is one nobody can audit afterwards.
    expect(m109).toMatch(/'missed', v_total - v_filed/)
  })

  it('deletes the admin override rather than leaving it lying around', () => {
    // A second way to set a set-once stamp is the kind of spare lever that gets
    // found later and wired to something.
    expect(m109).toMatch(/DROP FUNCTION IF EXISTS public\.league_reveal_table_now\(uuid\)/)
  })

  it('makes the deadline final on the CLOCK, not on the reveal stamp', () => {
    // ⚠ The reason this clause exists. The stamp is written lazily, on the first
    // read after the deadline — so between the deadline passing and somebody
    // loading the page, `revealed_at` is NULL and an admin who got there first
    // could still move it. Same pool, same instant, different answer.
    expect(m109).toMatch(/IF now\(\) >= OLD\.league_table_lock_at THEN/)
    expect(m109).toMatch(/It cannot be reopened/)
  })

  it('keeps every other guard 104 and 107 established', () => {
    // 109 replaces the whole trigger, so a dropped clause here silently undoes
    // an earlier migration rather than failing.
    expect(m109).toMatch(/league_mode is fixed at pool creation/)
    expect(m109).toMatch(/league_table_revealed_at is set once/)
    expect(m109).toMatch(/cannot be set in the past/)
    expect(m109).toMatch(/NEW\.table_deadline_reminder_sent_at := NULL/)
  })

  it('an open deadline can still be moved', () => {
    // Only the REOPEN dies. Scenarios 1 and 2 — set it at creation, move it
    // before it passes — are untouched.
    const guard = m109.slice(m109.indexOf('IF OLD.league_table_lock_at IS NOT NULL'))
    expect(guard).toMatch(/NEW\.league_table_lock_at <= now\(\)/)
  })
})

// =============================================================
describe('migration 107 — a new deadline is a new reminder', () => {
  const m107 = read('lib/migrations/107_a_new_deadline_is_a_new_reminder.sql')
  const m099 = read('lib/migrations/099_the_table_deadline_reminds_itself.sql')

  it('clears the reminder stamp whenever the deadline moves', () => {
    // 099 fires the pre-deadline reminder ONCE, via
    // pools.table_deadline_reminder_sent_at. 104 lets a PASSED deadline reopen.
    // Together, the straggler the reopen exists for is the one member the
    // reminder skips — the pool spends its settled answer to buy them a second
    // window and never tells them it is closing.
    expect(m107).toMatch(/NEW\.table_deadline_reminder_sent_at := NULL/)
  })

  it('clears it INSIDE the deadline-changed branch, not on every update', () => {
    // Clearing unconditionally would re-arm the reminder every time an admin
    // renamed the pool.
    const branch = m107.slice(
      m107.indexOf('IF OLD.league_table_lock_at IS NOT NULL'),
      m107.indexOf('RETURN NEW;'),
    )
    expect(branch).toMatch(/NEW\.table_deadline_reminder_sent_at := NULL/)
  })

  it('lives in the trigger, so no writer can forget it', () => {
    // Mobile writes rows directly and scripts move dates without going near
    // Next.js. A rule that only holds when one caller remembers it is not a rule.
    expect(m107).toMatch(/CREATE OR REPLACE FUNCTION public\.enforce_league_mode_immutable/)
  })

  it('keeps every guard 104 established', () => {
    // 107 replaces the whole function, so a dropped clause here would silently
    // undo 104 rather than fail.
    expect(m107).toMatch(/league_mode is fixed at pool creation/)
    expect(m107).toMatch(/league_table_revealed_at is set once/)
    expect(m107).toMatch(/cannot be set in the past/)
    expect(m107).toMatch(/DELIBERATELY ABSENT/)
    expect(codeOnly(m107)).not.toMatch(/now\(\)\s*>=\s*OLD\.league_table_lock_at/)
  })

  it('099 never reminds about a deadline that has already gone', () => {
    // The member cannot act on it. The admin can — that is their lever, not a
    // member reminder.
    expect(m099).toMatch(/po\.league_table_lock_at > now\(\)/)
  })

  it('099 no longer claims a passed deadline cannot be reopened', () => {
    // It said so twice, on 098's rule, and 098 was never applied.
    expect(m099).not.toMatch(/098 will not reopen it/)
    expect(m099).not.toMatch(/098\s+guarantees it cannot be reopened/)
  })
})

// =============================================================
describe('the move is announced, or it did not happen', () => {
  it('is sent by the route, awaited, not fired from the browser', () => {
    expect(route).toMatch(/await notifyTableDeadlineMoved/)
    // The old shape. A deadline that moves with nobody told is the unfair
    // version of this feature.
    expect(codeOnly(route)).not.toMatch(/\.catch\(\(\) => \{\}\)/)
  })

  it('reports a failed announcement instead of showing "Saved"', () => {
    expect(route).toMatch(/announced: false/)
    expect(settings).toMatch(/body\?\.announced === false/)
  })

  it('tells the whole pool, not only the people who had not filed', () => {
    const fn = notify.slice(notify.indexOf('export async function notifyTableDeadlineMoved'))
    const body = fn.slice(0, fn.indexOf('export async function sendLeagueNotice'))
    // Every member gets an email; only the SENTENCE differs by whether they
    // have filed. A `.filter(...)` on the roster would be the bug.
    expect(body).toMatch(/roster\.map\(/)
    expect(body).toMatch(/roster\.map\(\(m\) => m\.user_id\)/)
  })

  it('still excludes retired and detached entries', () => {
    const fn = notify.slice(notify.indexOf('export async function notifyTableDeadlineMoved'))
    expect(fn.slice(0, 2500)).toMatch(/\.is\('pool_entries\.retired_at', null\)/)
  })
})

// =============================================================
describe('leagueTableDeadlineMovedTemplate', () => {
  const reopened = leagueTableDeadlineMovedTemplate({
    userName: 'Sarah',
    poolName: 'Office Premier League',
    deadline: DEADLINE,
    hasUnfiledEntry: false,
    wasReopened: true,
    poolUrl: 'https://sportpool.io/pools/abc',
  })

  const moved = leagueTableDeadlineMovedTemplate({
    userName: 'Sarah',
    poolName: 'Office Premier League',
    deadline: DEADLINE,
    hasUnfiledEntry: true,
    wasReopened: false,
    poolUrl: 'https://sportpool.io/pools/abc',
  })

  it('names the timezone, because email cannot run LocalTime', () => {
    // The runtime clock is UTC. A time printed without its zone is a UTC time
    // shown to somebody who is not in UTC — the screen would say one thing and
    // the email another, with neither admitting which.
    expect(reopened.html).toMatch(/\b(UTC|GMT|[A-Z]{2,5}T)\b/)
  })

  it('tells a member who filed on time that they may revise', () => {
    // The half that makes an extension fair. Without it the organised members
    // are the only ones who do not get the extra days.
    expect(reopened.html).toMatch(/change it as many times as you like/i)
    expect(reopened.html).toMatch(/not just the people who hadn(&#39;|')t filed/i)
  })

  it('says nobody has seen their order — on an ORDINARY move', () => {
    // The reason an extension is not a leak, and the thing a member would
    // otherwise, reasonably, assume had happened. True here because the
    // deadline has not passed, so the RLS policies are still closed.
    expect(moved.html).toMatch(/no one has\s+seen your order|nobody(&#39;|')s table is shown/i)
  })

  it('does NOT say it on a reopen — by then it is false', () => {
    // ⚠ THIS ASSERTION USED TO REQUIRE THE OPPOSITE, against `reopened`. It was
    // written when 104 held the reveal back until everyone had filed, so a
    // reopened pool genuinely had shown nobody anything. 110 made the deadline
    // itself the reveal, which means that by the time a REOPEN email exists the
    // old deadline has passed and every table has been public since. The
    // sentence survived the migration that falsified it, pinned by this test.
    expect(reopened.html).not.toMatch(/no one has\s+seen your order/i)
    expect(reopened.html).not.toMatch(/nobody(&#39;|')s table is shown/i)
  })

  it('tells the reopened pool that their tables were already seen', () => {
    // The member who filed on time and did not peek is the one with something
    // to lose here, and the only one who would not otherwise find out.
    expect(reopened.html).toMatch(/everyone(&#39;|')s table was shown to the\s+pool/i)
    expect(reopened.html).toMatch(/has seen your order/i)
  })

  it('drops 104\'s withdrawn "with everyone in" from the ordinary move', () => {
    // The everybody-has-filed hold was removed by 109. The deadline alone
    // reveals, so promising a second condition describes a rule that is gone.
    expect(moved.html).not.toMatch(/with everyone in/i)
  })

  it('distinguishes a reopen from an ordinary move in the subject', () => {
    expect(reopened.subject).toMatch(/open again/i)
    expect(moved.subject).toMatch(/deadline .* has moved/i)
  })

  it('states the consequence as a rule, not as urgency', () => {
    expect(moved.html).toMatch(/scores nothing/i)
    for (const html of [reopened.html, moved.html]) {
      expect(html).not.toMatch(/don'?t miss out|last chance|hurry|act now/i)
    }
  })

  it('uses the plural voice, never first person singular', () => {
    expect(reopened.html).not.toMatch(/\b(I|I'm|I've|my|me)\b/)
    expect(moved.html).not.toMatch(/\b(I|I'm|I've|my|me)\b/)
  })
})

// =============================================================
// ⚠ "The two gates never collapse back into one" is GONE, and its subject with
// it. 104 split reads from writes so an admin could reopen a passed deadline;
// 109 removed the reopen, 110 removed the split. The 110 block above asserts the
// opposite property — that they ARE one expression — which is the rule now.
// =============================================================

// =============================================================
describe('the admin form no longer promises a frozen deadline', () => {
  it('does not tell the admin the deadline is final once it passes', () => {
    // ⚠ INVERTED TWICE, AND THIS IS THE SECOND TIME. 104 said the deadline could
    // move "including after it has passed"; 109 + 110 froze it and this test was
    // flipped to demand the screen say so; 114 unfroze it again. What the test
    // is really for is that the copy and the trigger agree — a screen promising
    // a frozen deadline over a database that allows the move is the defect,
    // whichever way round the rule currently is.
    const alerts = settings.slice(settings.indexOf('isTableMode && !tableStatus?.hasPassed'))
    expect(alerts.slice(0, 1400)).not.toMatch(/the tables are out and it is fixed/i)
    expect(alerts.slice(0, 1400)).not.toMatch(/the date\s+is now fixed/i)
  })

  it('warns, on the passed-deadline alert, that a reopen hands out an advantage', () => {
    // ⚠ THE LOAD-BEARING SENTENCE. Migration 114 removed the trigger that
    // refused the reopen, so this alert is the only thing standing between the
    // admin and a move that lets anyone who peeked re-order with knowledge.
    // 114 clears CLAUDE.md's disclosure gate ONLY because this is on screen.
    const passed = settings.slice(settings.indexOf("isTableMode && tableStatus?.hasPassed"))
    expect(passed.slice(0, 900)).toMatch(/already looked/i)
    expect(passed.slice(0, 900)).toMatch(/knowing what their rivals put/i)
  })

  it('never prints "nobody has seen" on a reopen confirmation', () => {
    // That bullet was unconditional. On a reopen it is precisely backwards —
    // the tables have been open since the old deadline — so it reassured the
    // admin at the one moment the reassurance was false.
    // codeOnly again: the comment above the ternary quotes the old bullet, so a
    // raw indexOf finds the explanation rather than the JSX.
    const jsx = codeOnly(settings)
    const reopenBullet = jsx.indexOf('Everyone has already seen everyone else')
    const elseBullet = jsx.indexOf('Nobody has seen anybody else')
    expect(reopenBullet).toBeGreaterThan(-1)
    expect(elseBullet).toBeGreaterThan(-1)
    // The reassuring line must be the ELSE half of a reopen ternary: the reopen
    // wording comes first, and a `) : (` separates the two.
    expect(reopenBullet).toBeLessThan(elseBullet)
    expect(jsx.slice(reopenBullet, elseBullet)).toMatch(/\)\s*:\s*\(/)
  })

  it('has no second door — the reveal is not an admin decision any more', () => {
    // 104 gave the admin "reveal without them" for a pool held on a straggler.
    // 109 removed the hold, so there is nothing to override; leaving the button
    // would offer a choice the database no longer has.
    expect(settings).not.toMatch(/Reveal without them/)
    expect(settings).not.toMatch(/handleRevealWithoutStragglers/)
    expect(codeOnly(route)).not.toMatch(/export async function POST/)
    expect(codeOnly(route)).not.toMatch(/league_reveal_table_now/)
  })

  it('seeds both deadline fields from the same timezone frame', () => {
    // A UTC calendar date glued to a local wall-clock time, recombined as
    // local, silently shifted the deadline 24 hours on a save that touched
    // nothing — for any deadline whose UTC and local dates disagree.
    expect(settings).toMatch(/function localDateValue/)
    expect(codeOnly(settings)).not.toMatch(/toISOString\(\)\.split\('T'\)\[0\]/)
  })
})

// =============================================================
// Migration 114 is where the LIVE deadline rule now is. 104, 107, 109 and 110
// above are the history that produced it, and the assertions that describe a
// frozen deadline are assertions about those FILES — migrations are append-only,
// so they stay true and must not be edited to match the new rule.
// =============================================================
describe('migration 114 — the deadline reopens', () => {
  it('removes the freeze', () => {
    const fn = m114.slice(m114.indexOf('FUNCTION public.enforce_league_mode_immutable'))
    const body = fn.slice(0, fn.indexOf('COMMENT ON FUNCTION'))
    // 109's block, kept by 110, gone here. Its absence is the whole migration.
    expect(codeOnly(body)).not.toMatch(/IF now\(\) >= OLD\.league_table_lock_at THEN/)
    expect(codeOnly(body)).not.toMatch(/It cannot be reopened/)
  })

  it('keeps every guard that is not the freeze', () => {
    // 114 replaces the whole function, so a clause dropped by accident here
    // silently undoes an earlier migration rather than failing loudly.
    const fn = m114.slice(m114.indexOf('FUNCTION public.enforce_league_mode_immutable'))
    const body = fn.slice(0, fn.indexOf('COMMENT ON FUNCTION'))
    expect(body).toMatch(/league_mode is fixed at pool creation/)
    expect(body).toMatch(/cannot be set in the past/)
    expect(body).toMatch(/NEW\.table_deadline_reminder_sent_at := NULL/)
  })

  it('still refuses a deadline in the past', () => {
    // With the freeze gone this is the ONLY constraint left on the move. A
    // reopen landing in the past would reopen writes and re-reveal in the same
    // instant, which is a state nobody chooses on purpose.
    const fn = m114.slice(m114.indexOf('FUNCTION public.enforce_league_mode_immutable'))
    const body = fn.slice(0, fn.indexOf('COMMENT ON FUNCTION'))
    expect(body).toMatch(/NEW\.league_table_lock_at <= now\(\)/)
  })

  it('brings back no reveal stamp — 110 stands', () => {
    // The rescue is restored by dropping the freeze, NOT by restoring 104's
    // second switch. 109's header asked for exactly this and warned against
    // the half-revert.
    expect(codeOnly(m114)).not.toMatch(/league_table_revealed_at/)
    expect(codeOnly(m114)).not.toMatch(/league_reveal_table_if_ready/)
    expect(codeOnly(m114)).not.toMatch(/league_reveal_table_now/)
  })

  it('records what the reopen costs, where the next person will read it', () => {
    // The harm is disclosed rather than prevented, which is only defensible if
    // the reasoning survives next to the code that permits it.
    expect(m114).toMatch(/re-?hides/i)
    expect(m114).toMatch(/disclosure gate/i)
  })
})

// =============================================================
// The straggler rescue is one path across four files. It was fully built, then
// made unreachable by 109/110 without being removed, which is why 114 is a
// trigger change and almost nothing else. These assertions keep the far end of
// the path alive so it cannot rot while the trigger allows it.
// =============================================================
describe('the reopen path is wired end to end', () => {
  it('the settings form can still reach the reopen branch', () => {
    expect(settings).toMatch(/kind: 'reopen' \| 'extend' \| 'shorten'/)
    expect(settings).toMatch(/Reopen and tell everyone/)
    // The comment that called it dead code has to go with the freeze.
    expect(settings).not.toMatch(/`reopen` is now unreachable/)
  })

  it('the route still tells the reopen apart from an ordinary move', () => {
    expect(codeOnly(route)).toMatch(/wasReopened/)
  })

  it('the notification still has its own words for a reopen', () => {
    expect(notify).toMatch(/Your table is open again/)
  })

  it('an untouched deadline does not block the rest of the form', () => {
    // The pickers are seeded FROM the deadline, so on a passed-deadline pool
    // the field holds a past instant before the admin types anything. While the
    // future-check ran unconditionally, that `return` fired ahead of the pool
    // UPDATE and NO setting could be saved — not the name, the cap or the fee.
    expect(settings).toMatch(/deadlineUntouched/)
    expect(settings).toMatch(/if \(!deadlineUntouched && newDeadline <= new Date\(\)\)/)
  })

  it('does not claim nothing was saved when the deadline alone failed', () => {
    // The pool UPDATE commits before the PATCH runs, so "Nothing else was
    // changed" sent the admin back to re-enter changes that had landed.
    // codeOnly, because the comment recording the fix quotes the sentence it
    // replaced — the exact case the helper's own docblock describes.
    expect(codeOnly(settings)).not.toMatch(/Nothing else was changed/)
    expect(settings).toMatch(/Your other settings were saved/)
  })
})
