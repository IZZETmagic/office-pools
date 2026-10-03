// verify-crews-store — lib/crews/store.ts and read.ts against the REAL database.
//
//   npx tsx scripts/verify-crews-store.ts
//
// The unit tests run the store against an in-memory fake, which cannot catch a column name the real
// schema does not have, a constraint the fake does not model, or an RPC that answers differently.
// This walks the main flows end to end on production, as the seeded test accounts
// (test_user_01…04 — never a real person), on a crew with NO pools, and deletes it afterwards
// (everything crew-side cascades from crews).
//
// The one-time email link (155) is walked too: armed by hand (the send switch is off), claimed by
// test_user_04, spent.
//
// ⚠ What it deliberately does NOT do: attach the crew to a pool (pools.crew_id is set once and can
// never be cleared — 154), or TAKE a seat (that would add a test account to a real pool). A seat is
// declined against a real running pool's first lock, which writes only crew_seats.

import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { dirname, resolve } from 'path'

;(() => {
  let path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) {
    try {
      const common = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim()
      path = resolve(dirname(resolve(common)), '.env.local')
    } catch {
      /* fall through */
    }
  }
  if (!existsSync(path)) {
    console.error('\n  This script needs .env.local (service-role credentials).\n')
    process.exit(1)
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import {
  answerInvite,
  answerSeat,
  claimInviteByToken,
  createCrew,
  inviteToCrew,
  leaveCrew,
  lookupUsername,
  readInviteLink,
  removeMember,
  rejoinCrew,
  renameCrew,
  setCoCaptain,
} from '../lib/crews/store'
import { listMyCrews, readCrew, readRoster } from '../lib/crews/read'
import { readCrewNeeds } from '../lib/crews/needs'
import { newInviteToken } from '../lib/crews/inviteToken'

const admin = createAdminClient()
const U = (n: number) => `a0000000-0000-0000-0000-00000000000${n}` // test_user_01…
const [CAP, TWO, THREE, FOUR] = [U(1), U(2), U(3), U(4)]
const stamp = Date.now()

let pass = 0
let fail = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${ok || detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

async function main() {
  // A running pool with a future first lock, and a finished one — only crew_seats rows touch them.
  const { data: candidates } = await admin.from('pools').select('pool_id').is('archived_at', null).eq('status', 'open').limit(50)
  let runningPool: string | null = null
  for (const c of candidates ?? []) {
    const { data: lock } = await admin.rpc('pool_first_lock_at', { p_pool_id: c.pool_id })
    if (lock && Date.parse(lock as string) > Date.now()) {
      runningPool = c.pool_id
      break
    }
  }
  const { data: finished } = await admin.from('pools').select('pool_id').eq('status', 'completed').limit(1).maybeSingle()

  console.log('\ncreate, rename')
  const created = await createCrew(admin, { userId: CAP, name: `Verify crew ${stamp}` })
  check('createCrew', created.ok, created)
  if (!created.ok) return
  const crewId = created.crewId
  try {
    check('renameCrew by the captain', (await renameCrew(admin, { actorId: CAP, crewId, name: `Verify crew ${stamp} ✓` })).ok)

    console.log('\nlookup and invites')
    const matches = await lookupUsername(admin, 'TEST_USER_02')
    check('lookupUsername is exact and case-insensitive', matches.some((m) => m.userId === TWO), matches)
    check('lookupUsername is never a prefix search', (await lookupUsername(admin, 'test_user_0')).length === 0)

    const toTwo = await inviteToCrew(admin, { actorId: CAP, crewId, userId: TWO })
    check('invite by user_id', toTwo.ok && !!toTwo.inviteId, toTwo)
    const toThreeByEmail = await inviteToCrew(admin, { actorId: CAP, crewId, email: 'TestUser03@test.com' })
    check('invite by an email that has an account answers "sent"', toThreeByEmail.ok && toThreeByEmail.sent)
    const { data: threeInvite } = await admin.from('crew_invites').select('invitee_user_id, invitee_email').eq('crew_id', crewId).eq('invitee_user_id', THREE).maybeSingle()
    check('…and became an invite to that account', !!threeInvite && threeInvite.invitee_email === null, threeInvite)
    const unknown = `nobody-${stamp}@verify.invalid`
    await inviteToCrew(admin, { actorId: CAP, crewId, email: unknown.toUpperCase() })
    const { data: emailInvite } = await admin.from('crew_invites').select('invitee_email').eq('crew_id', crewId).eq('invitee_email', unknown).maybeSingle()
    check('an unknown email is kept, lowercase', !!emailInvite, emailInvite)
    const again = await inviteToCrew(admin, { actorId: CAP, crewId, email: unknown })
    const { count: copies } = await admin.from('crew_invites').select('invite_id', { count: 'exact', head: true }).eq('crew_id', crewId).eq('invitee_email', unknown)
    check('a repeat email answers "sent" and writes nothing', again.ok && copies === 1, { again, copies })
    check('a member cannot add people', !(await inviteToCrew(admin, { actorId: TWO, crewId, userId: FOUR })).ok)

    console.log('\nActivity → Needs you')
    const twoNeeds = await readCrewNeeds(admin, TWO, Date.now())
    const inviteCard = twoNeeds.find((n) => n.kind === 'crew_invite' && n.crew?.crew_id === crewId)
    check('the invitee gets an invite card, no deadline, Join / No thanks', !!inviteCard && inviteCard.deadline_at === null && inviteCard.actions?.map((a) => a.id).join() === 'decline,join', inviteCard)

    console.log('\nanswers')
    if (toTwo.ok && toTwo.inviteId) check('Join', (await answerInvite(admin, { userId: TWO, inviteId: toTwo.inviteId, answer: 'join' })).ok)
    const { data: inv3 } = await admin.from('crew_invites').select('invite_id').eq('crew_id', crewId).eq('invitee_user_id', THREE).is('resolved_at', null).maybeSingle()
    if (inv3) check('No thanks', (await answerInvite(admin, { userId: THREE, inviteId: inv3.invite_id, answer: 'decline' })).ok)
    const reinvite = await inviteToCrew(admin, { actorId: CAP, crewId, userId: THREE })
    check('No thanks sticks', !reinvite.ok && reinvite.reason === 'declined_before', reinvite)

    console.log('\nroles and reads')
    check('the captain names a co-captain', (await setCoCaptain(admin, { actorId: CAP, crewId, targetId: TWO })).ok)
    const view = await readCrew(admin, crewId, CAP, Date.now())
    check('readCrew: two members, captain first', view?.members.map((m) => m.role).join() === 'captain,co_captain', view?.members)
    check('readCrew: the captain sees the open email invite', !!view?.invites?.some((i) => i.email === unknown), view?.invites)
    check('readCrew: someone who said no cannot see the crew', (await readCrew(admin, crewId, THREE, Date.now())) === null)
    const asTwo = await readCrew(admin, crewId, TWO, Date.now())
    check('readCrew: the co-captain sees invites too', Array.isArray(asTwo?.invites))
    const cards = await listMyCrews(admin, TWO, Date.now())
    check('listMyCrews: quiet, two people, no seasons', cards.some((c) => c.crewId === crewId && c.people === 2 && c.seasons === 0 && c.status.kind === 'quiet'), cards.find((c) => c.crewId === crewId))

    console.log('\nthe one-time link (155)')
    // What notify.sendInviteNotice does as it sends. The send switch is off, so armed by hand — the
    // same conditional update, on the open invite to the unknown address.
    const { token, hash } = newInviteToken()
    const { data: armed } = await admin
      .from('crew_invites')
      .update({ token_hash: hash })
      .eq('crew_id', crewId)
      .eq('invitee_email', unknown)
      .is('resolved_at', null)
      .is('invitee_user_id', null)
      .select('invite_id')
    check('the email invite is armed with a hash', armed?.length === 1, armed)
    const { error: accountArm } = await admin.from('crew_invites').update({ token_hash: newInviteToken().hash }).eq('crew_id', crewId).eq('invitee_user_id', THREE)
    check('an invite to an ACCOUNT can never carry a link (155 CHECK)', !!accountArm, accountArm?.message)
    const link = await readInviteLink(admin, { token, viewerId: null })
    check('the link shows who asked, which crew, how many', link.state === 'open' && link.crewName.startsWith('Verify crew') && link.people === 2, link)
    const asSender = await readInviteLink(admin, { token, viewerId: CAP })
    check('…and tells the sender it isn’t theirs', asSender.state === 'open' && asSender.block === 'own_invite', asSender)
    check('the sender can’t claim it', !(await claimInviteByToken(admin, { userId: CAP, token, answer: 'join' })).ok)
    const claimed = await claimInviteByToken(admin, { userId: FOUR, token, answer: 'join' })
    check('whoever opens it, signed in, joins', claimed.ok, claimed)
    const { data: row } = await admin
      .from('crew_invites')
      .select('invitee_user_id, invitee_email, token_hash, resolution')
      .eq('invite_id', armed?.[0]?.invite_id ?? '')
      .maybeSingle()
    check('…the invite is theirs, answered, the link spent', row?.invitee_user_id === FOUR && row.invitee_email === null && row.token_hash === null && row.resolution === 'joined', row)
    check('the link works once', !(await claimInviteByToken(admin, { userId: THREE, token, answer: 'join' })).ok)
    check('…and now reads as not valid', (await readInviteLink(admin, { token, viewerId: null })).state === 'invalid')
    check('the joiner is in the crew', (await readCrew(admin, crewId, FOUR, Date.now()))?.viewer.active === true)
    check('…and leaves again, so the rest of this run is unchanged', (await leaveCrew(admin, { crewId, userId: FOUR })).ok)
    const roster = await readRoster(admin, { crewId, starterId: CAP, tier: 'free', now: Date.now() })
    check('readRoster: everyone but the starter, Free saves 9', roster?.rows.length === 1 && roster?.spots === 9 && roster?.memberCap === 10, roster)

    console.log('\nseats (crew_seats only)')
    if (runningPool) {
      await admin.from('crew_seats').insert({ pool_id: runningPool, crew_id: crewId, user_id: TWO })
      const { data: lock } = await admin.rpc('pool_first_lock_at', { p_pool_id: runningPool })
      const seatCard = (await readCrewNeeds(admin, TWO, Date.now())).find((n) => n.kind === 'crew_seat' && n.pool_id === runningPool)
      check('a held seat shows as a card whose deadline is the first lock', !!seatCard && seatCard.deadline_at === lock, { seatCard, lock })
      check('Not this one, while open', (await answerSeat(admin, { userId: TWO, poolId: runningPool, answer: 'decline' })).ok)
      const { data: s } = await admin.from('crew_seats').select('resolution').eq('pool_id', runningPool).eq('user_id', TWO).maybeSingle()
      check('…the seat is declined', s?.resolution === 'declined', s)
    } else console.log('  · no running pool with a future first lock — skipped')
    if (finished) {
      await admin.from('crew_seats').insert({ pool_id: finished.pool_id, crew_id: crewId, user_id: CAP })
      await answerSeat(admin, { userId: CAP, poolId: finished.pool_id, answer: 'decline' })
      const { data: s } = await admin.from('crew_seats').select('resolution').eq('pool_id', finished.pool_id).eq('user_id', CAP).maybeSingle()
      check('after the first lock there is nothing to decline', s?.resolution === null, s)
    }

    // Keep this group together? — READ-ONLY, so a real admin of a finished pool is fine to ask.
    const { data: finishedPools } = await admin
      .from('pools')
      .select('pool_id, admin_user_id')
      .eq('status', 'completed')
      .is('crew_id', null)
      .is('archived_at', null)
      .is('brand_slug', null)
      .is('crew_prompt_dismissed_at', null)
      .limit(20)
    let saveChecked = false
    for (const fp of finishedPools ?? []) {
      const { count } = await admin.from('pool_members').select('member_id', { count: 'exact', head: true }).eq('pool_id', fp.pool_id).neq('role', 'spectator')
      if ((count ?? 0) < 2) continue
      const cards = await readCrewNeeds(admin, fp.admin_user_id, Date.now())
      const card = cards.find((n) => n.kind === 'crew_save' && n.pool_id === fp.pool_id)
      check(`a finished pool's admin is offered "Keep this group together?" (${count} players)`, !!card && card.subtitle === `Save these ${count} as a crew for next time`, card && { kind: card.kind, subtitle: card.subtitle })
      saveChecked = true
      break
    }
    if (!saveChecked) console.log('  · no finished multi-member pool to check — skipped')

    console.log('\nleaving, removal, succession')
    check('the co-captain cannot remove the captain', !(await removeMember(admin, { actorId: TWO, crewId, targetId: CAP })).ok)
    const left = await leaveCrew(admin, { crewId, userId: CAP })
    check('the captain leaves → the co-captain is captain', left.ok && left.newCaptainId === TWO, left)
    if (finished) {
      const { data: s } = await admin.from('crew_seats').select('resolution').eq('pool_id', finished.pool_id).eq('user_id', CAP).maybeSingle()
      check('…and their open seats are released', s?.resolution === 'released', s)
    }
    check('someone who left can rejoin themselves', (await rejoinCrew(admin, { crewId, userId: CAP })).ok)
    check('…as a member', (await readCrew(admin, crewId, CAP, Date.now()))?.viewer.role === 'member')
    check('the new captain removes them', (await removeMember(admin, { actorId: TWO, crewId, targetId: CAP })).ok)
    check('the removed cannot rejoin themselves', !(await rejoinCrew(admin, { crewId, userId: CAP })).ok)
    check('the removed cannot see the crew', (await readCrew(admin, crewId, CAP, Date.now())) === null)
    const last = await leaveCrew(admin, { crewId, userId: TWO })
    check('the last one out closes the crew', last.ok && last.closed, last)
    const { count: openInvites } = await admin.from('crew_invites').select('invite_id', { count: 'exact', head: true }).eq('crew_id', crewId).is('resolved_at', null)
    check('…and withdraws its open invites', openInvites === 0, openInvites)
    check('a closed crew is gone from My Crews', !(await listMyCrews(admin, TWO, Date.now())).some((c) => c.crewId === crewId))
  } finally {
    const { error } = await admin.from('crews').delete().eq('crew_id', crewId)
    const { count } = await admin.from('crew_members').select('user_id', { count: 'exact', head: true }).eq('crew_id', crewId)
    console.log(`\n  cleanup: crew deleted${error ? ` ✗ ${error.message}` : ''}; ${count ?? '?'} member rows remain (expect 0)`)
  }
}

main()
  .then(() => {
    console.log(`\n  ${pass} passed, ${fail} failed\n`)
    process.exit(fail ? 1 : 0)
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
