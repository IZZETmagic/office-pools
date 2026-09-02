// =============================================================
// HOW THE MATCH LIST IS CUT UP
// =============================================================
// Extracted from `app/(tabs)/results.tsx` on 2026-09-02, when league fixtures
// joined the list and the sectioning stopped being obvious.
//
// ⚠ IT LIVES HERE SO IT CAN BE TESTED. `mobile/` has no test runner of its own;
// the root `vitest.config.ts` picks up `mobile/**/__tests__/**` and can only run
// modules that import nothing from React Native. So this file holds NO imports
// but a type — which erases — and the screen keeps the rendering.
//
// The rule that earns the split: one list now carries two competitions, whose
// only shared field is the kickoff. Everything below has to be right for both,
// and "right for both" is a thing you assert, not a thing you eyeball.
// =============================================================

import type { ResultsMatch } from './useTournamentMatches';

export type MatchSection = {
  id: string;
  label: string;
  matches: ResultsMatch[];
};

export const ROUND_ORDER: Array<{ keys: string[]; label: string }> = [
  { keys: ['group'], label: 'Group Stage' },
  { keys: ['round_32', 'round_of_32'], label: 'Round of 32' },
  { keys: ['round_16', 'round_of_16'], label: 'Round of 16' },
  { keys: ['quarter_final'], label: 'Quarter Finals' },
  { keys: ['semi_final'], label: 'Semi Finals' },
  { keys: ['third_place'], label: 'Third Place' },
  { keys: ['final'], label: 'Final' },
];

export function parsedDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function dayLabel(dayStart: Date): string {
  const today = startOfDay(new Date());
  const target = startOfDay(dayStart);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return target.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

const byKickoff = (a: ResultsMatch, b: ResultsMatch) =>
  (parsedDate(a.matchDate)?.getTime() ?? 0) - (parsedDate(b.matchDate)?.getTime() ?? 0);

/**
 * One section per calendar day. Competition-agnostic — it reads the kickoff and
 * nothing else, which is why it was the only mode that worked for a league on
 * the day league fixtures first arrived.
 */
export function dateSections(matchList: ResultsMatch[]): MatchSection[] {
  const buckets = new Map<number, ResultsMatch[]>();
  for (const m of matchList) {
    const d = parsedDate(m.matchDate);
    const key = d ? startOfDay(d).getTime() : -1;
    const arr = buckets.get(key) ?? [];
    arr.push(m);
    buckets.set(key, arr);
  }
  const keys = Array.from(buckets.keys()).sort((a, b) => a - b);
  return keys.map((key) => ({
    id: `day-${key}`,
    label: key < 0 ? 'Date TBD' : dayLabel(new Date(key)),
    matches: (buckets.get(key) ?? []).sort(byKickoff),
  }));
}

/**
 * Sections for the "Round" filter — which, for a league, means MATCHWEEK.
 *
 * ⚠ THIS USED TO RETURN AN EMPTY ARRAY FOR A LEAGUE, and the screen said "No
 * Matches" while holding 380 of them. `ROUND_ORDER` is a ladder of seven World
 * Cup stages; the league adapter stamps `stage = 'regular_season'`, which is in
 * none of them, so every fixture fell through and the empty state fired on a
 * full list. An empty result is a valid one — which is exactly why it was
 * silent.
 *
 * A league groups by `roundNumber`, and the label is the wording the web already
 * uses (`getStageLabel` in `app/pools/[pool_id]/results/MatchCard.tsx`): a member
 * reads "Matchweek 12" on either surface, and `regular_season` on neither.
 */
export function roundSections(matchList: ResultsMatch[]): MatchSection[] {
  const worldCup = ROUND_ORDER.map((round) => {
    const roundMatches = matchList.filter((m) => round.keys.includes(m.stage)).sort(byKickoff);
    return roundMatches.length > 0
      ? { id: round.label, label: round.label, matches: roundMatches }
      : null;
  }).filter((s): s is MatchSection => s !== null);

  const byMatchweek = new Map<number, ResultsMatch[]>();
  for (const m of matchList) {
    if (m.roundNumber === null) continue;
    const arr = byMatchweek.get(m.roundNumber) ?? [];
    arr.push(m);
    byMatchweek.set(m.roundNumber, arr);
  }
  const league = Array.from(byMatchweek.keys())
    .sort((a, b) => a - b)
    .map((n) => ({
      id: `mw-${n}`,
      label: `Matchweek ${n}`,
      matches: (byMatchweek.get(n) ?? []).sort(byKickoff),
    }));

  // A member can hold both — a finished World Cup pool and a live league one.
  // The World Cup's ladder first, then the season, rather than interleaving two
  // orderings that have nothing to say to each other.
  return [...worldCup, ...league];
}

// ---- What actually gets mounted ----
//
// ⚠ THE RESULTS SCREEN IS A PLAIN `ScrollView`, WHICH DOES NOT VIRTUALISE. Every
// row in every section is mounted, always. That was fine at World Cup scale — 64
// matches — and is not at league scale: one season is 380 fixtures, and a member
// in two leagues is 760.
//
// So the list is windowed, in ROWS rather than in sections, because sections are
// not the cost: date mode makes ~180 tiny ones and matchweek mode 38 large ones
// out of the same 380 fixtures.
//
// ⚠ AND THE BUDGET IS CHOSEN SO THE WORLD CUP IS UNTOUCHED. 64 < 120, so a World
// Cup list renders whole exactly as it does today, and this cannot regress the
// surface that is already shipped. `resultsSections.test.ts` pins that.
export const ROW_BUDGET = 120;

/** How many more sections one tap of "Show earlier" / "Show more" reveals. */
export const EXPAND_STEP = 10;

/**
 * The slice to mount, grown outward from the section a member is actually
 * looking for.
 *
 * ⚠ OUTWARD FROM THE ANCHOR, not from the top. A season runs August to May, so
 * "the first 120 rows" is August — five months of old results — while the game
 * on tonight is off the bottom of the window entirely. It walks backwards first
 * because the most recent results are worth more than fixtures three weeks out.
 */
export function windowSections(
  sections: MatchSection[],
  anchorIndex: number,
  rowBudget: number,
): { start: number; end: number } {
  if (sections.length === 0) return { start: 0, end: 0 };
  const anchor = Math.min(Math.max(anchorIndex, 0), sections.length - 1);
  let start = anchor;
  let end = anchor + 1;
  let rows = sections[anchor].matches.length;
  while (rows < rowBudget && (start > 0 || end < sections.length)) {
    if (start > 0) {
      rows += sections[start - 1].matches.length;
      start -= 1;
      if (rows >= rowBudget) break;
    }
    if (end < sections.length) {
      rows += sections[end].matches.length;
      end += 1;
    }
  }
  return { start, end };
}

/**
 * Which section the member came here to see: the one with a game in progress,
 * else the next one to be played, else the most recent.
 *
 * ⚠ The same priority the auto-scroll uses, resolved once so the two cannot
 * disagree — a window that excluded the section the screen then tried to scroll
 * to would simply not scroll, with nothing on screen to say why.
 */
export function anchorSectionIndex(sections: MatchSection[]): number {
  const live = sections.findIndex((s) => s.matches.some((m) => m.status === 'live'));
  if (live !== -1) return live;
  const next = sections.findIndex((s) => s.matches.some((m) => m.status === 'scheduled'));
  if (next !== -1) return next;
  return Math.max(0, sections.length - 1);
}
