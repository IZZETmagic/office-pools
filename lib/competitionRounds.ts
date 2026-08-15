// =============================================================
// COMPETITION ROUNDS — what a "round" is, per competition format
// =============================================================
// A round is a prediction session: it opens, members pick, it locks at a
// deadline, it completes, the next one opens. `pool_round_states.round_key` is
// already `TEXT`, so the state machine itself is format-agnostic. What was NOT
// format-agnostic is how a round is *defined*:
//
//   lib/tournament.ts   ROUND_KEYS          a static list of seven World Cup rounds
//                       ROUND_ORDER         a hardcoded linked list of those seven
//                       ROUND_MATCH_STAGES  round -> the match STAGES it contains
//
// That last one is the load-bearing assumption. It says a round is identified by
// the stages inside it — true for a bracket, where "Quarter Finals" *is* the set
// of `stage='quarter_final'` fixtures. It is false for a league, where every one
// of 38 matchweeks has the same stage (`regular_season`) and is told apart by
// `round_number`. Ask `ROUND_MATCH_STAGES['mw_12']` and you get `undefined`,
// which every call site coalesces to `[]`, which selects no fixtures — a
// matchweek that opens, contains nothing, and submits nothing. Silently.
//
// So a round carries a SELECTOR rather than a stage list: "the fixtures with
// these stages" or "the fixtures in this matchweek". Both formats answer the
// same questions through one interface, and adding a third shape later means
// adding a selector variant, not another `?? []` at thirty call sites.
//
// The World Cup definitions still live in lib/tournament.ts and are read from
// there — this module reshapes them, it does not replace or re-declare them.
// One source of truth for the bracket, one new one for leagues.
// =============================================================

import { ROUND_KEYS, ROUND_LABELS, ROUND_MATCH_STAGES, type RoundKey } from '@/lib/tournament'
import type { CompetitionFormat } from '@/lib/competitionFormat'

// ---------------------------------------------------------------- Selectors

/** How to find the fixtures belonging to a round. */
export type RoundSelector =
  | { kind: 'stages'; stages: string[] }
  | { kind: 'matchweek'; roundNumber: number }

/** The minimum a fixture must expose to be assigned to a round. */
export type RoundableMatch = {
  stage: string
  round_number?: number | null
}

export type RoundDef = {
  /** Value stored in `pool_round_states.round_key`. */
  key: string
  /** Human label. Never a raw key in the UI. */
  label: string
  /** Position in the sequence, 0-based. Drives ordering and "what's next". */
  order: number
  selector: RoundSelector
}

// ---------------------------------------------------------------- Matchweeks

const MATCHWEEK_PREFIX = 'mw_'

/** `12` -> `'mw_12'`. */
export function matchweekKey(roundNumber: number): string {
  return `${MATCHWEEK_PREFIX}${roundNumber}`
}

/**
 * `'mw_12'` -> `12`; anything else -> `null`.
 *
 * Strict on purpose. `mw_012`, `mw_`, `mw_x` and `MW_12` all return null rather
 * than being coerced, because a key that round-trips differently than it was
 * written would produce two `pool_round_states` rows for one matchweek.
 */
export function matchweekNumber(key: string): number | null {
  if (!key.startsWith(MATCHWEEK_PREFIX)) return null
  const raw = key.slice(MATCHWEEK_PREFIX.length)
  if (!/^[1-9]\d*$/.test(raw)) return null
  return parseInt(raw, 10)
}

export function isMatchweekKey(key: string): boolean {
  return matchweekNumber(key) !== null
}

// ---------------------------------------------------------------- Round sets

/** The seven World Cup rounds, in order, reshaped from lib/tournament.ts. */
export function bracketRoundDefs(): RoundDef[] {
  return ROUND_KEYS.map((key, order) => ({
    key,
    label: ROUND_LABELS[key],
    order,
    selector: { kind: 'stages', stages: ROUND_MATCH_STAGES[key] ?? [] },
  }))
}

/**
 * One round per matchweek present in the fixture list.
 *
 * Derived from the fixtures rather than from a count, because matchweek count
 * is not a constant across leagues: 20 clubs give 38, 18 give 34, and the
 * Championship's 24 give 46. Reading it from the data means a new league needs
 * no code. Fixtures with a NULL `round_number` are skipped — that is how
 * play-off rounds arrive from the feed (`"Final"` has no trailing ordinal), and
 * they are deliberately not matchweeks.
 */
export function leagueRoundDefs(matches: RoundableMatch[]): RoundDef[] {
  const numbers = new Set<number>()
  for (const m of matches) {
    if (m.stage !== 'regular_season') continue
    if (typeof m.round_number === 'number' && Number.isInteger(m.round_number) && m.round_number > 0) {
      numbers.add(m.round_number)
    }
  }
  return [...numbers]
    .sort((a, b) => a - b)
    .map((roundNumber, order) => ({
      key: matchweekKey(roundNumber),
      label: `Matchweek ${roundNumber}`,
      order,
      selector: { kind: 'matchweek', roundNumber },
    }))
}

export function roundDefsFor(format: CompetitionFormat, matches: RoundableMatch[]): RoundDef[] {
  return format === 'league' ? leagueRoundDefs(matches) : bracketRoundDefs()
}

// ---------------------------------------------------------------- Lookups

/**
 * Label for a round key, without needing the fixture list.
 *
 * Falls back to the key itself, matching what call sites already do with
 * `ROUND_LABELS[k] ?? k` — but a matchweek now resolves properly instead of
 * showing a member the string `mw_12`.
 */
export function roundLabel(key: string): string {
  const mw = matchweekNumber(key)
  if (mw !== null) return `Matchweek ${mw}`
  return ROUND_LABELS[key as RoundKey] ?? key
}

/** The selector for a key, derivable without the fixture list. */
export function selectorForKey(key: string): RoundSelector {
  const mw = matchweekNumber(key)
  if (mw !== null) return { kind: 'matchweek', roundNumber: mw }
  return { kind: 'stages', stages: ROUND_MATCH_STAGES[key as RoundKey] ?? [] }
}

/** Does this fixture belong to this round? */
export function matchInRound(match: RoundableMatch, selector: RoundSelector): boolean {
  if (selector.kind === 'stages') return selector.stages.includes(match.stage)
  return match.stage === 'regular_season' && match.round_number === selector.roundNumber
}

/** The fixtures of one round, by key. */
export function matchesInRound<T extends RoundableMatch>(matches: T[], key: string): T[] {
  const selector = selectorForKey(key)
  return matches.filter((m) => matchInRound(m, selector))
}

// ---------------------------------------------------------------- Sequence

/**
 * The round after `key`, or `null` at the end of the competition.
 *
 * Replaces `ROUND_ORDER`, a hardcoded seven-entry linked list. A league cannot
 * use a static map — matchweek 34 is the last one in the Bundesliga and the
 * 38th of 46 in the Championship — so the successor is resolved against the
 * rounds that actually exist.
 *
 * `available` may be unordered; it is sorted here. Passing the pool's real
 * `pool_round_states` keys means a season whose feed is missing a matchweek
 * still advances rather than dead-ending on the gap.
 */
export function nextRoundKey(key: string, available: string[]): string | null {
  const ordered = sortRoundKeys(available)
  const i = ordered.indexOf(key)
  if (i === -1 || i === ordered.length - 1) return null
  return ordered[i + 1]
}

/**
 * Round keys in competition order.
 *
 * Matchweeks sort numerically — a lexical sort would put `mw_10` before `mw_2`
 * and open the season's rounds in the wrong order. Bracket keys sort by their
 * position in ROUND_KEYS. Anything unrecognised sorts last, stably, rather than
 * being dropped.
 */
export function sortRoundKeys(keys: string[]): string[] {
  const bracketOrder = new Map<string, number>(ROUND_KEYS.map((k, i) => [k as string, i]))
  return [...keys].sort((a, b) => rank(a) - rank(b))

  function rank(k: string): number {
    const mw = matchweekNumber(k)
    if (mw !== null) return 10_000 + mw
    const b = bracketOrder.get(k)
    if (b !== undefined) return b
    return 1_000_000
  }
}
