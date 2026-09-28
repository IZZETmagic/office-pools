// =============================================================
// NEEDS YOU — the top of the Activity tab
// =============================================================
// Only things the member can act on right now, each with the button that does
// it. Nothing here is stored: it is derived from the same `LeagueCardFacts` the
// pool cards read, so a card leaves the moment the pick is made, and the Pools
// tab and the Activity tab cannot disagree about whether a week is done.
//
// Disclosure gate (CLAUDE.md): "This lists picks that are still open, and goes
// away when you've made them." Passes — it is a to-do list, not a nudge.
//
// PURE — tested in lib/activity/__tests__/needsYou.test.ts.
// =============================================================

import type { LeagueCardFacts } from '@/lib/league/poolCards'

export type ActivityLink = {
  pathname: string
  params: Record<string, string>
}

export type NeedItem = {
  id: string
  kind: 'pick' | 'lms' | 'table'
  pool_id: string
  pool_name: string
  entry_id: string
  title: string
  subtitle: string
  deadline_at: string
  /** Progress, for the bar. Single-decision modes are 0 of 1. */
  made: number
  total: number
  cta: string
  link: ActivityLink
}

export type NeedsYouPool = {
  poolId: string
  poolName: string
  mode: string | null
  entryId: string | null
}

const MODE_LABEL: Record<string, string> = {
  pickem: "Pick'em",
  showdown: 'Showdown',
  last_man_standing: 'Last One Standing',
  table: 'Predict the Table',
}

export function buildNeedsYou(
  pools: NeedsYouPool[],
  facts: Map<string, LeagueCardFacts>,
  now: number,
): NeedItem[] {
  const out: NeedItem[] = []

  for (const p of pools) {
    const f = facts.get(p.poolId)
    if (!f || !p.entryId) continue
    // `hasSubmitted` already counts an eliminated LMS member as done — they
    // cannot pick, so they must never be asked to (see poolCards.ts 2c).
    if (f.hasSubmitted || f.totalPicks === 0) continue
    if (!f.deadlineAt) continue
    const deadline = Date.parse(f.deadlineAt)
    if (Number.isNaN(deadline) || deadline <= now) continue

    const modeLabel = MODE_LABEL[p.mode ?? ''] ?? 'League'

    if (p.mode === 'table') {
      out.push({
        id: `need-table-${p.entryId}`,
        kind: 'table',
        pool_id: p.poolId,
        pool_name: p.poolName,
        entry_id: p.entryId,
        title: 'Order your table',
        subtitle: `${p.poolName} · ${modeLabel}`,
        deadline_at: f.deadlineAt,
        made: 0,
        total: 1,
        cta: 'Order',
        link: { pathname: '/pool/[id]/table/[entryId]', params: { id: p.poolId, entryId: p.entryId } },
      })
      continue
    }

    if (f.openMatchweekNumber == null) continue
    const mw = f.openMatchweekNumber

    if (p.mode === 'last_man_standing') {
      if (!f.lms) continue
      const left = f.lms.survivorsLeft
      out.push({
        id: `need-lms-${p.entryId}-${mw}`,
        kind: 'lms',
        pool_id: p.poolId,
        pool_name: p.poolName,
        entry_id: p.entryId,
        title: `Choose your Matchweek ${mw} team`,
        subtitle: `${p.poolName} · ${left} still in`,
        deadline_at: f.deadlineAt,
        made: 0,
        total: 1,
        cta: 'Choose',
        link: { pathname: '/pool/[id]/survivor/[entryId]', params: { id: p.poolId, entryId: p.entryId } },
      })
      continue
    }

    out.push({
      id: `need-pick-${p.entryId}-${mw}`,
      kind: 'pick',
      pool_id: p.poolId,
      pool_name: p.poolName,
      entry_id: p.entryId,
      title: `Pick Matchweek ${mw}`,
      subtitle: `${p.poolName} · ${modeLabel}`,
      deadline_at: f.deadlineAt,
      made: f.madePicks,
      total: f.totalPicks,
      cta: f.madePicks > 0 ? 'Finish' : 'Pick now',
      link: {
        pathname: '/pool/[id]/pickem/[entryId]',
        params: { id: p.poolId, entryId: p.entryId, mw: String(mw) },
      },
    })
  }

  // Soonest deadline first — the order a member would do them in.
  out.sort((a, b) => (a.deadline_at < b.deadline_at ? -1 : a.deadline_at > b.deadline_at ? 1 : 0))
  return out
}
