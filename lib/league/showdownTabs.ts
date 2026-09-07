// =============================================================
// WHAT SHOWDOWN LEADS WITH, ON BOTH APPS
// =============================================================
// Ryan, 2026-09-07: the browser and the phone should be the same pool. The tab
// ORDER is the most visible half of that — it is the first thing a member sees
// and the last thing anybody thinks to check — so it lives here rather than
// inside `PoolDetail`'s 3,200 lines, and `showdownTabOrder.guard.test.ts` reads
// it against `mobile/lib/poolTabs.ts`.
//
// ⚠ THE SAME LIFT THE PHONE ALREADY MADE. `getVisiblePoolTabs` was pulled out
// of `PoolTabBar` for exactly this reason: it was pure logic living in a
// component that imported React Native, which put it beyond the test runner —
// and by then it had quietly grown a consumer that depended on its ORDER. The
// web had the same shape and the same blind spot.
//
// ## Why these three, in this order
//
//   1  Duel         the mode is named after it; everything else is how you
//                   train for it. A Showdown pool that opens on a totals table
//                   reads as pick'em with a duel bolted on.
//   2  Leaderboard  the reason the duel matters — it is where the 500 lands.
//   3  The Room     "what did everyone else do", which is a question you ask
//                   after the first two rather than before them.
//
// ⚠ THIS IS THE HEAD OF THE STRIP, NOT THE WHOLE OF IT. Everything else keeps
// the order it has in every other mode, and the web KEEPS the surfaces the
// phone has no room for — Results, the league Table, Banter. Ryan's call: RN's
// order, web's breadth.
//
// ⚠ AND IT IS NOT WHERE A MEMBER LANDS. `defaultTabFor` names `duels`
// outright rather than taking `[0]` of this list, so reordering here cannot
// silently move the landing tab. The phone learned that one the hard way — its
// landing IS `[0]`, and the tab it landed on moved the day Duel appeared in
// front of it.

/** Web tab keys. `duels` is plural for historical reasons; the phone's is not. */
export type ShowdownLeadKey = 'duels' | 'leaderboard' | 'room'

export const SHOWDOWN_LEAD_TABS = [
  { key: 'duels', label: 'Duel', rn: 'duel' },
  { key: 'leaderboard', label: 'Leaderboard', rn: 'leaderboard' },
  { key: 'room', label: 'The Room', rn: 'room' },
] as const satisfies ReadonlyArray<{ key: ShowdownLeadKey; label: string; rn: string }>

/**
 * Put Showdown's three in front, keeping everything else in its usual order.
 *
 * ⚠ IT FILTERS RATHER THAN PREPENDS. `leaderboard` is already in the caller's
 * list, so a plain prepend would render it twice — once in Showdown's position
 * and once in the default one. Two pills with the same label, three apart,
 * both working: the kind of thing that survives review because neither is
 * broken.
 */
export function withShowdownFirst<T extends { key: string; label: string }>(
  isShowdown: boolean,
  tabs: T[],
): Array<T | { key: ShowdownLeadKey; label: string }> {
  if (!isShowdown) return tabs
  const lead = SHOWDOWN_LEAD_TABS.map((t) => ({ key: t.key, label: t.label }))
  const leadKeys = new Set<string>(lead.map((t) => t.key))
  return [...lead, ...tabs.filter((t) => !leadKeys.has(t.key))]
}
