import { redirect, notFound } from 'next/navigation'

import { createClient, createAdminClient } from '@/lib/supabase/server'
import { readPoolDuels, readMatchweekPoints, headToHead } from '@/lib/league/duels'
import { duelScoreline, duelVerdict, decisiveFixture } from '@/lib/league/duelVerdict'
import { DuelDecision } from './DuelDecision'

// /pools/:pool_id/duel/:matchweek — how one settled duel went.
//
// Plan: drafts/2026-08-31_showdown_duel_recap_plan.md
//
// A REAL ROUTE, NOT AN OVERLAY, for three reasons that all matter:
//   · the back button works, which a modal's does not
//   · the URL is shareable, which is the whole point of the card
//   · `next/og` can render a preview image FROM a route (v2)
//
// And it is reachable any time, not only from the popup. A recap is a RECORD; a
// page you can see exactly once is a page nobody links to.
//
// ⚠ THE REVEAL GATE IS ENFORCED BY RLS, DELIBERATELY, NOT BY THIS FILE.
// The duel is read on the USER client, so migration 116/119/120's policy
// decides what exists. A guessable URL — `/duel/38` — therefore returns 404 for
// a sealed pairing rather than leaking who somebody plays in May. Do NOT switch
// this read to the admin client to "simplify" it; that is the entire seal.
export const dynamic = 'force-dynamic'

export default async function DuelDecisionPage({
  params,
}: {
  params: Promise<{ pool_id: string; matchweek: string }>
}) {
  const { pool_id, matchweek } = await params
  const matchweekNumber = Number(matchweek)
  if (!Number.isInteger(matchweekNumber) || matchweekNumber < 1) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: userData } = await supabase
    .from('users').select('user_id').eq('auth_user_id', user.id).single()
  if (!userData) redirect('/dashboard')

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) notFound()

  const { data: pool } = await supabase
    .from('pools').select('pool_name, league_mode').eq('pool_id', pool_id).single()
  if (!pool || pool.league_mode !== 'showdown') notFound()

  // ⚠ USER CLIENT. See the header — this read IS the reveal gate.
  const { duels } = await readPoolDuels(supabase, pool_id)

  const { data: myEntries } = await supabase
    .from('pool_entries').select('entry_id').eq('member_id', membership.member_id)
  const mine = new Set((myEntries ?? []).map((e) => e.entry_id))

  // The viewer's own duel in this matchweek. Members can see every duel in the
  // pool up to the open matchweek, so this must filter to THEIRS — the page is
  // "how did I do", not a browser for other people's weeks.
  const duel = duels.find(
    (d) => d.matchweek_number === matchweekNumber &&
      (mine.has(d.entry_a) || (d.entry_b !== null && mine.has(d.entry_b))),
  )
  if (!duel || !duel.settled_at) notFound()

  const iAmA = mine.has(duel.entry_a)
  const myEntry = iAmA ? duel.entry_a : duel.entry_b!
  const theirEntry = iAmA ? duel.entry_b : duel.entry_a

  // Names and faces for both sides, from the members already visible to us.
  const { data: members } = await supabase
    .from('pool_members')
    .select('users!inner(user_id, username, full_name), pool_entries(entry_id, entry_name)')
    .eq('pool_id', pool_id)
  type MemberRow = {
    users: { user_id: string; username: string | null; full_name: string | null } | null
    pool_entries: { entry_id: string; entry_name: string | null }[] | null
  }
  const names = new Map<string, string>()
  const people = new Map<string, { user_id: string; full_name: string | null; username: string | null }>()
  for (const m of (members ?? []) as unknown as MemberRow[]) {
    for (const e of m.pool_entries ?? []) {
      names.set(e.entry_id, e.entry_name || m.users?.username || 'Entry')
      if (m.users) {
        people.set(e.entry_id, {
          user_id: m.users.user_id,
          full_name: m.users.full_name,
          username: m.users.username,
        })
      }
    }
  }

  // ⚠ ADMIN for the per-fixture scores: `league_match_scores` is deny-all
  // (migration 050) and a user-scoped read returns zero rows and NO error — the
  // card would render a 0-0 scoreline and look merely disappointing.
  //
  // Safe to widen here only because the duel above already passed the reveal
  // gate: the matchweek is settled, so it is long past lock and there is
  // nothing left to withhold.
  const admin = createAdminClient()
  const { perFixture } = await readMatchweekPoints(admin, pool_id, matchweekNumber)

  // ⚠ THE POSITION CHANGE IS READ, NOT DERIVED. `previous_final_rank` is frozen
  // by the matchweek snapshot (059/061/094) at the moment a matchweek settles,
  // and `league_finalize_ranks` then recomputes `final_rank` — so the pair
  // spans exactly this matchweek's movement, accuracy AND duel points together.
  // Rebuilding it from the duels alone would give the DUEL table's position,
  // which since 121 is not the table any more.
  //
  // ⚠ Admin: `league_entry_totals` is deny-all (050).
  const { data: totals } = await admin
    .from('league_entry_totals')
    .select('final_rank, previous_final_rank')
    .eq('entry_id', myEntry)
    .maybeSingle()

  const scoreline = duelScoreline(perFixture.get(myEntry), theirEntry ? perFixture.get(theirEntry) : undefined)
  const verdict = duelVerdict(scoreline, iAmA ? duel.points_a : duel.points_b, theirEntry === null)
  const decisive = theirEntry
    ? decisiveFixture(perFixture.get(myEntry), perFixture.get(theirEntry))
    : null

  // The fixture that decided it, named. Read on the user client — fixtures are
  // public within the competition.
  let decisiveLabel: string | null = null
  if (decisive !== null) {
    const { data: mw } = await supabase
      .from('league_matchweeks')
      .select('matchweek_id, season_id')
      .eq('matchweek_number', matchweekNumber)
      .limit(1).maybeSingle()
    if (mw) {
      const { data: fx } = await supabase
        .from('league_fixtures')
        .select('fixture_number, home_club_id, away_club_id')
        .eq('matchweek_id', mw.matchweek_id)
        .eq('fixture_number', decisive)
        .maybeSingle()
      if (fx) {
        const { data: clubs } = await supabase
          .from('league_clubs')
          .select('club_id, short_name, name')
          .in('club_id', [fx.home_club_id, fx.away_club_id])
        const label = (id: string) => {
          const c = (clubs ?? []).find((x) => x.club_id === id)
          return c?.short_name || c?.name || null
        }
        const h = label(fx.home_club_id)
        const a = label(fx.away_club_id)
        if (h && a) decisiveLabel = `${h} v ${a}`
      }
    }
  }

  // -----------------------------------------------------------
  // THE BANTER QUOTE — their last word before the games
  // -----------------------------------------------------------
  // The joke in the mockup is somebody's pre-match confidence read back after
  // the result. So: the OPPONENT'S last typed message before this matchweek's
  // first kickoff.
  //
  // ⚠ `message_type = 'text'` ONLY. Of 4,626 messages in the database, 2,955
  // are auto-generated cards — `badge_flex`, `standings_drop`,
  // `prediction_share` — and quoting one of those back at somebody would be
  // absurd. Only 1,671 are words a person typed.
  //
  // ⚠ ON A LOSS TOO — Ryan overturned my call, 2026-08-31, and he is right.
  // I had shown it only on a win, reasoning that their boast read back to
  // somebody who just lost was twisting a knife. But a pool where people talk
  // trash wants the receipt on both sides, and hiding it was us deciding what a
  // member can handle. The message is public either way; they can scroll to it.
  //
  // ⚠ NOT TRUNCATED. A message longer than the card gets DROPPED, not cut:
  // shortening what somebody said changes what they said, and half a sentence
  // read back is a misquote with our name on it.
  //
  // ⚠ AND IT MUST BE OMITTED FROM ANYTHING SHARED (Ryan, 2026-08-31). Quoting
  // Priya inside the pool she posted in is the joke working; putting her words
  // on a card that leaves the pool republishes her somewhere she did not post,
  // and she is not the one pressing the button.
  let quote: { content: string; author: string; at: string } | null = null
  if (theirEntry) {
    const { data: mwWindow } = await supabase
      .from('league_matchweeks')
      .select('first_kickoff_at')
      .eq('matchweek_number', matchweekNumber)
      .not('first_kickoff_at', 'is', null)
      .order('first_kickoff_at', { ascending: false })
      .limit(1).maybeSingle()
    const themPerson = people.get(theirEntry)
    if (mwWindow?.first_kickoff_at && themPerson) {
      const { data: msg } = await supabase
        .from('pool_messages')
        .select('content, created_at')
        .eq('pool_id', pool_id)
        .eq('user_id', themPerson.user_id)
        .eq('message_type', 'text')
        .lt('created_at', mwWindow.first_kickoff_at)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
      const content = msg?.content?.trim() ?? ''
      if (content && content.length <= 140) {
        quote = {
          content,
          author: names.get(theirEntry) ?? themPerson.username ?? 'Them',
          at: msg!.created_at,
        }
      }
    }
  }

  return (
    <DuelDecision
      quote={quote}
      poolId={pool_id}
      poolName={pool.pool_name}
      matchweek={matchweekNumber}
      verdict={verdict}
      scoreline={scoreline}
      decisiveFixture={decisiveLabel}
      you={{ name: names.get(myEntry) ?? 'You', person: people.get(myEntry) ?? null }}
      them={theirEntry
        ? { name: names.get(theirEntry) ?? 'Unknown', person: people.get(theirEntry) ?? null }
        : null}
      // ⚠ headToHead over EVERY settled duel between the two, this one included.
      // It read `=== 3` until 2026-08-31 and would have called them all losses.
      record={theirEntry ? headToHead(duels, myEntry, theirEntry) : null}
      position={{ now: totals?.final_rank ?? null, before: totals?.previous_final_rank ?? null }}
      shareUrl={`/pools/${pool_id}/duel/${matchweekNumber}`}
    />
  )
}
