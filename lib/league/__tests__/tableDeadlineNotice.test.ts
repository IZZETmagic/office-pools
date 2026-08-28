// =============================================================
// The table-deadline reminder
// =============================================================
// This is the highest-stakes notification in the product. Every other reminder
// is about one week of a thirty-eight week season; this one is about the whole
// season, because Table mode is a single decision, it locks once, and migration
// 098 will not reopen it for anybody afterwards.
//
// So the failures worth guarding against are not "the email looks wrong". They
// are:
//
//   · it goes to somebody who has already filed a table          (nagging)
//   · it goes twice                                              (nagging)
//   · it goes about a deadline that has already passed           (cruel)
//   · it never goes at all because the row cannot be written     (silent zero)
//
// The last one is not hypothetical: `table_deadline` has been a legal outbox
// KIND since migration 059, and the target constraint from 071 made the ROW
// illegal, so the kind sat unproduced for four migrations without anything
// failing loudly.
//
// The behavioural half needs a database and lives in the verify script. This is
// the always-on half: it proves the copy is right, and that nobody has removed
// the structural guards that keep the other three failures impossible.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

import { leagueTableDeadlineTemplate } from '@/lib/email/templates'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const migration = read('lib/migrations/099_the_table_deadline_reminds_itself.sql')
const notify = read('lib/league/notify.ts')
const outbox = read('app/api/cron/league-outbox/route.ts')
const notices = read('app/api/cron/league-notices/route.ts')

// A Friday, comfortably in the future relative to nothing — the template only
// formats it, so a fixed instant keeps the assertions stable.
const DEADLINE = '2026-08-28T19:00:00.000Z'

describe('leagueTableDeadlineTemplate', () => {
  const one = leagueTableDeadlineTemplate({
    userName: 'Sarah',
    poolName: 'Office Premier League',
    deadline: DEADLINE,
    unpredictedEntries: ['Sarah C'],
    clubCount: 20,
    poolUrl: 'https://sportpool.io/pools/abc',
  })

  it('names the day in the subject, so it is answerable from the inbox', () => {
    expect(one.subject).toContain('Office Premier League')
    expect(one.subject).toMatch(/closes (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/)
  })

  it('states the consequence as a rule, not as urgency', () => {
    // The disclosure gate: "an entry with no table scores nothing" is a fact
    // about the scoring. "Don't miss out!" is a feeling we would be inventing.
    expect(one.html).toContain('scores nothing')
    expect(one.html).not.toMatch(/don'?t miss out/i)
    expect(one.html).not.toMatch(/last chance|hurry|act now|running out/i)
  })

  it('does not promise the admin cannot reopen it', () => {
    // ⚠ THIS TEST IS INVERTED FROM WHAT IT ASSERTED, deliberately.
    //
    // It used to require the sentence "nobody can reopen it", on migration
    // 098's rule that a passed deadline is frozen for everyone. 098 was never
    // applied and migration 104 supersedes it: an admin MAY move the deadline
    // forward, including after it has passed, precisely so a member who forgot
    // is not written off for a whole season.
    //
    // So the old promise is now false, and a reminder that makes it is worse
    // than one that says nothing — it tells a member they have no recourse at
    // the exact moment they do.
    expect(one.html).not.toMatch(/nobody can reopen/i)
    expect(one.html).not.toMatch(/including your pool admin/i)
  })

  it('still states what the deadline actually does', () => {
    // Dropping the false promise must not drop the consequence with it: the
    // order is fixed at the deadline and everyone's table is shown at once.
    expect(one.html).toMatch(/your order is fixed/i)
    expect(one.html).toMatch(/shown to the pool at once/i)
  })

  it('reassures that predicting early is not a commitment trap', () => {
    // The whole reason somebody puts this off is fear of picking too early.
    expect(one.html).toMatch(/change your order as many times/i)
  })

  it('uses the plural voice, never first person singular', () => {
    // House rule for customer-facing email: we/us/our.
    expect(one.html).not.toMatch(/\b(I|I'm|I've|my|me)\b/)
  })

  it('reads the club count rather than assuming twenty', () => {
    const bundesliga = leagueTableDeadlineTemplate({
      userName: 'Jonas',
      poolName: 'Büro Bundesliga',
      deadline: DEADLINE,
      unpredictedEntries: ['Jonas W'],
      clubCount: 18,
      poolUrl: 'https://sportpool.io/pools/abc',
    })
    expect(bundesliga.html).toContain('18 clubs')
    expect(bundesliga.html).not.toContain('20 clubs')
  })

  it('lists the entries only when there is more than one', () => {
    // With a single entry, "Entries with no table yet: Sarah C" is noise —
    // the member knows which entry is theirs.
    expect(one.html).not.toMatch(/Entries with no table yet/)
    expect(one.html).toMatch(/You have<\/strong>? ?not done it yet|You have not done it yet/)

    const many = leagueTableDeadlineTemplate({
      userName: 'Ryan',
      poolName: 'Office Premier League',
      deadline: DEADLINE,
      unpredictedEntries: ['Ryan A', 'Ryan B'],
      clubCount: 20,
      poolUrl: 'https://sportpool.io/pools/abc',
    })
    expect(many.html).toMatch(/Entries with no table yet/)
    expect(many.html).toContain('Ryan B')
    expect(many.html).toMatch(/Some of your entries have not done it yet/)
  })

  it('links to the screen that fixes it, not the pool root', () => {
    expect(one.html).toContain('?tab=predictions')
  })
})

describe('the guards that keep it from nagging or going silent', () => {
  it('⚠ the outbox accepts a target-less row ONLY for table_deadline', () => {
    // Widening this to every kind would make the outbox a place to put events
    // that could not be modelled, and the consumer switches on which target is
    // present — so a wrongly-shaped row is claimed and never handled.
    expect(migration).toMatch(
      /fixture_id IS NULL AND matchweek_id IS NULL AND kind = 'table_deadline'/,
    )
  })

  it('⚠ the drain selects notifications by "not a fixture event"', () => {
    // The old filter was `matchweek_id !== null`. A pool-level row matched no
    // branch under it: claimed every tick, never sent, never marked.
    expect(outbox).toContain('ev.fixture_id === null')
    expect(outbox).not.toContain('ev.matchweek_id !== null')
  })

  it('the producer refuses a deadline that has already passed', () => {
    expect(migration).toMatch(/po\.league_table_lock_at > now\(\)/)
  })

  it('the SENDER re-checks that too, because a row can sit in the outbox', () => {
    // Queue time and send time are different moments — a failed drain can put
    // days between them.
    expect(notify).toMatch(/deadline already passed/)
  })

  it('sends once, stamped in the same statement that queues', () => {
    expect(migration).toContain('table_deadline_reminder_sent_at')
    // Stamped for every pool that was DUE, not only those that queued a row —
    // otherwise an undrained duplicate re-queues every hour.
    expect(migration).toMatch(/UPDATE pools po SET table_deadline_reminder_sent_at = now\(\)/)
    expect(migration).toMatch(/FROM due d WHERE po\.pool_id = d\.pool_id/)
  })

  it('has a unique pending index so two producer runs cannot double-queue', () => {
    expect(migration).toMatch(/uq_lse_pending_pool/)
    expect(migration).toMatch(
      /WHERE processed_at IS NULL AND fixture_id IS NULL AND matchweek_id IS NULL/,
    )
  })

  it('skips archived pools', () => {
    expect(migration).toMatch(/po\.archived_at IS NULL/)
    expect(notify).toMatch(/pool is archived/)
  })

  it('only mails members whose entries have no table', () => {
    // The constraint that lets the reminder exist at all under the gate.
    expect(notify).toMatch(/everyone has filed a table/)
    expect(notify).toMatch(/!hasTable\.has\(e\.entry_id\)/)
  })

  it('excludes retired and detached entries', () => {
    expect(notify).toMatch(/is\('pool_entries\.retired_at', null\)/)
  })

  it('a table-deadline queue failure does not fail the matchweek notices', () => {
    // They were already queued AND stamped by that point, so a 500 would report
    // a tick as failed that had in fact done half its work irreversibly.
    expect(notices).toMatch(/if \(tableErr\) console\.error/)
  })
})
