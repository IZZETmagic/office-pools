import { STRIPE_TOP_LIFT, modeIdentityColor, type ModeIdentityKey } from './tokens'
import { getCompetitionColor } from './competitionColor'
import { adjustLightness, withLightness } from './oklch'

/**
 * Presentation for a pool's prediction mode.
 *
 * `getModeName` and the pill's colours previously existed as private copies in both
 * app/pools/PoolsClient.tsx and app/dashboard/DashboardClient.tsx. They had already
 * drifted from the app — `progressive` rendered in Tailwind's stock purple, which
 * is not a SportPool colour at all and is one of the few families the palette shim
 * in globals.css deliberately does not alias. Both screens now share this module,
 * so the mode a pool is in looks the same everywhere.
 *
 * Colours come from mobile/components/pools/PoolListItem.tsx via lib/design/tokens.
 *
 * ## Two levels, not one
 *
 * `prediction_mode` alone cannot name a league pool. All four league games carry
 * the same value, `league_pickem`, and which game it is lives in `league_mode`
 * (migration 077). Every function here therefore takes the league mode as an
 * optional second argument.
 *
 * ⚠ Passing only the first argument for a league pool is what these functions
 * used to receive, and the fallback was `return mode` — so a league card's pill
 * rendered the literal string **`league_pickem`** on the pools list, the
 * dashboard and the invite page. A raw column value is never a label; the
 * fallbacks below say "League" instead, which is at least true.
 */

// Design tokens (colour, icon, label) exist for the three bracket modes only.
import type { BracketPredictionMode } from '../predictionMode'
export type PoolMode = BracketPredictionMode

/**
 * The four league games. Mirrors `pools_league_mode_ck` (migration 077) — if you
 * widen the CHECK, widen this in the same commit.
 */
export const LEAGUE_MODES = ['pickem', 'showdown', 'last_man_standing', 'table'] as const
export type LeagueMode = (typeof LEAGUE_MODES)[number]

const MODE_NAME: Record<PoolMode, string> = {
  full_tournament: 'Full',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
}

/**
 * Short labels for the card pill, which is 10px and shares a row with the admin
 * badge, the status tag and the player count. "Last Man Standing" spelled out
 * pushes that row to a second line on a phone, so it is trimmed here and spelled
 * out in `LEAGUE_LONG_NAME` where there is room.
 */
const LEAGUE_NAME: Record<LeagueMode, string> = {
  pickem: 'Pick’em',
  showdown: 'Showdown',
  last_man_standing: 'Last Man',
  table: 'Table',
}

/** The wizard's own labels, verbatim — see LEAGUE_MODES in CreatePoolModal. */
const LEAGUE_LONG_NAME: Record<LeagueMode, string> = {
  pickem: 'Matchweek Pick’em',
  showdown: 'Showdown',
  last_man_standing: 'Last Man Standing',
  table: 'Predict the Table',
}

/**
 * How light the pill's text sits, per theme.
 *
 * Absolute lightness targets rather than deltas off each mode colour: the seven
 * start as much as 0.14 apart in lightness, so a shared delta would leave some
 * pills visibly fainter than others. Targeting one value each way puts every
 * mode between 6.3:1 and 9.2:1 against its own tint — above WCAG AAA for the
 * 10px bold the pill is set in, which is the size that makes this matter.
 */
const INK_L_LIGHT = 0.45
const INK_L_DARK = 0.84

function isPoolMode(mode: string): mode is PoolMode {
  return mode in MODE_NAME
}

function isLeagueMode(mode: string | null | undefined): mode is LeagueMode {
  return typeof mode === 'string' && mode in LEAGUE_NAME
}

/**
 * True for a league pool, whichever game it is playing.
 *
 * Keyed on `prediction_mode` rather than on `league_mode` being non-null,
 * because `league_mode` is the thing most likely to be missing from a caller's
 * SELECT — and a league pool with an unselected league mode must still not be
 * treated as a World Cup pool.
 */
export function isLeaguePoolMode(mode: string): boolean {
  return mode === 'league_pickem'
}

/** Short label, for pills and cards where space is tight. */
export function getModeName(mode: string, leagueMode?: string | null): string {
  if (isLeaguePoolMode(mode)) return isLeagueMode(leagueMode) ? LEAGUE_NAME[leagueMode] : 'League'
  return isPoolMode(mode) ? MODE_NAME[mode] : mode
}

/**
 * Full label, for surfaces with room to spell it out — currently the invite/join
 * page, which is often someone's first encounter with the product and should not
 * greet them with "Bracket".
 */
const MODE_LONG_NAME: Record<PoolMode, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

export function getModeLongName(mode: string, leagueMode?: string | null): string {
  if (isLeaguePoolMode(mode)) {
    return isLeagueMode(leagueMode) ? LEAGUE_LONG_NAME[leagueMode] : 'League'
  }
  return isPoolMode(mode) ? MODE_LONG_NAME[mode] : mode
}

/**
 * The pill's colours for one mode, as custom properties for `.mode-pill`.
 *
 * ⚠ REPLACES A PAIR OF TAILWIND CLASSES, and had to. The old version mapped
 * modes onto the palette's semantic families — `bg-primary-600/12
 * text-primary-700` and so on — which works while there are three modes and
 * five families. There are seven modes. The four league ones shared a single
 * gold pill because the families had run out, so Showdown and Last Man Standing
 * were indistinguishable at a glance.
 *
 * Custom properties rather than more families because a mode colour is an
 * IDENTITY, like a competition's brand colour, not UI chrome that should follow
 * the theme. What does follow the theme is the treatment — how light the text
 * sits and how strong the tint is — and `.mode-pill` in globals.css owns that
 * under `html.dark`. So one authored colour per mode yields both themes.
 */
export function getModeChip(
  mode: string,
  leagueMode?: string | null,
): { '--mode-base': string; '--mode-ink': string; '--mode-ink-dark': string } {
  const base = modeIdentityColor[modeIdentityKey(mode, leagueMode)]
  return {
    '--mode-base': base,
    '--mode-ink': withLightness(base, INK_L_LIGHT),
    '--mode-ink-dark': withLightness(base, INK_L_DARK),
  }
}

/**
 * Which of the seven identity colours a pool takes.
 *
 * Same fallbacks as the stripe used to have: a league pool with no `league_mode`
 * reads as Pick'em (three production pools carry NULL there and all three are
 * Pick'em), and an unrecognised bracket mode reads as full_tournament.
 */
function modeIdentityKey(mode: string, leagueMode?: string | null): ModeIdentityKey {
  if (isLeaguePoolMode(mode)) return isLeagueMode(leagueMode) ? leagueMode : 'pickem'
  return isPoolMode(mode) ? mode : 'full_tournament'
}

/**
 * The two stops of the 5px bar down the left edge of a pool card: the
 * competition's brand colour, lifted at the top.
 *
 * ⚠ THE MODE IS NOT IN HERE, and that is the decision rather than an omission.
 * The stripe answers "which competition"; the mode is answered by the pill
 * beside it, which already carries the mode's NAME in words and its own colour.
 * Encoding the mode a third time in a five-pixel bar bought nothing, and the
 * two-fact version — competition fading into mode — had a failure the pill does
 * not: with 23 competition × mode pairs today and closer to 40 as the other
 * leagues land, the fade's legibility was a property of each pair rather than of
 * the design, and two pairs (La Liga and Bundesliga against Last Man Standing)
 * were red into red and rendered as a solid bar. Ryan's call, 2026-08-29.
 *
 * ⚠ RETURNS COLOURS, NOT CSS. React Native has no CSS gradients — the mobile
 * card feeds an array to expo-linear-gradient — so this stops at the two stops
 * and each platform draws them. On web that is `.pool-stripe` in globals.css.
 *
 * A World Cup pool takes the World Cup's gold whichever bracket mode it is in.
 * That is a deliberate loss of a distinction the old stripe made: three
 * differently-coloured stripes for three modes of one finished competition were
 * telling members apart pools they already tell apart by name.
 */
export function getPoolStripe(pool: {
  /** `tournaments.external_league_id`. Null renders the unthemed slate. */
  externalLeagueId?: number | null
}): [string, string] {
  const brand = getCompetitionColor(pool.externalLeagueId)
  return [adjustLightness(brand, STRIPE_TOP_LIFT), brand]
}
