import { NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import {
  buildOpponentDossier,
  THIN_LIFETIME,
  type OpponentDossier,
} from '@/lib/scouting/opponent'
import { readCrowdMajority, readLifetimePicks } from '@/lib/scouting/readOpponent'

// =============================================================
// /api/me/scouting — your own scouting report, from the Profile hub
// =============================================================
// How YOU pick, across every league pool you have played in. The same engine
// as the pool dossier (`buildOpponentDossier` over `readLifetimePicks`) — this
// route is the lifetime half of it pointed inward, not a second implementation.
//
// ## ⚠⚠ ONLY THE LIFETIME FIELDS LEAVE THIS ROUTE
//
// "How someone picks is a lifetime trait. How they are doing is a pool fact."
// The pool dossier already splits its fields that way (`SCOPE` in
// lib/scouting/opponent.ts). Hit rate, points per fixture, the form strip and
// missed picks are POOL facts: pool depth changes what a point is worth
// (migration 064's XOR), and interleaving two pools' matchweeks makes a
// timeline that never happened. Computed over a whole history they would be
// arithmetic over two units. So they are not sent — a phone cannot render a
// field it was never given.
//
// ## ⚠ NO ID IN THE PATH, SO NOTHING TO GUARD
//
// The subject is always the caller, resolved from the session. There is no
// entry or user id a caller could swap for somebody else's. The reveal seal
// still applies inside `readLifetimePicks` (`lock_at <= now()` on the
// matchweek), so your own open-week picks are not counted either — the same
// numbers an opponent's dossier shows about you.
//
// ## ⚠ LEAGUE PICKS ONLY
//
// `readLifetimePicks` reads `league_predictions`; World Cup pools have no
// `league_season_id` and are not counted. The screen says so.
//
// ## Cost
//
// Two bounded reads for the picks (paged, 8,000-row ceiling that throws) and
// one set-based RPC for the crowd. Nothing fans out per fixture.
// =============================================================

export const dynamic = 'force-dynamic'

/** The fields of a dossier that describe HOW someone picks. See the header. */
export type SelfScoutDossier = Pick<
  OpponentDossier,
  'mostBacked' | 'mostOpposed' | 'blindSpot' | 'baseline' | 'fingerprint' | 'contrarian' | 'read'
> & {
  lifetime: NonNullable<OpponentDossier['lifetime']>
}

async function handler() {
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const admin = createAdminClient()

  let span
  try {
    span = await readLifetimePicks(admin, userData.user_id)
  } catch (e) {
    console.error('[me/scouting] lifetime read failed —', (e as Error).message)
    return NextResponse.json({ error: 'Could not read your picks' }, { status: 500 })
  }

  // ⚠ THE CROWD IS BEST-EFFORT, as it is on the pool dossier: without it the
  // contrarian card is absent and every other card still renders.
  let crowdMajority
  try {
    crowdMajority = await readCrowdMajority(
      admin,
      span.picks.map((p) => p.fixtureId),
    )
  } catch (e) {
    console.error('[me/scouting] crowd unavailable —', (e as Error).message)
    crowdMajority = undefined
  }

  const full = buildOpponentDossier(span.picks, { crowdMajority })

  const dossier: SelfScoutDossier = {
    mostBacked: full.mostBacked,
    mostOpposed: full.mostOpposed,
    blindSpot: full.blindSpot,
    baseline: full.baseline,
    fingerprint: full.fingerprint,
    contrarian: full.contrarian,
    read: full.read,
    lifetime: {
      picks: full.picks,
      pools: span.pools,
      competitions: span.competitions,
      droppedConflicts: span.droppedConflicts,
      thin: full.picks < THIN_LIFETIME,
    },
  }

  // ⚠ No name in the payload: the phone already holds it (Home data), and the
  // header is keyed on `user_id` for the avatar gradient.
  /**
   * ⚠ The viewer's own face, read here rather than taken from `/api/avatar/me`.
   * That endpoint returns a COMPOSED SVG at a fixed size, which is right for a
   * profile card and wrong for a header that sizes its own circle — the scout
   * header composes from the config, like every other surface that draws a face
   * at its own scale.
   */
  const { data: me } = await admin
    .from('users')
    .select('avatar_colour, avatar_build')
    .eq('user_id', userData.user_id)
    .maybeSingle()

  return NextResponse.json({
    user_id: userData.user_id,
    avatar_colour: me?.avatar_colour ?? null,
    avatar_build: me?.avatar_build ?? null,
    dossier,
  })
}

export const GET = withPerfLogging('/api/me/scouting', handler)
