import { poolModeGradient } from './tokens'

/**
 * Presentation for a pool's prediction mode.
 *
 * `getModeName` and `getModeTagClass` previously existed as private copies in both
 * app/pools/PoolsClient.tsx and app/dashboard/DashboardClient.tsx. They had already
 * drifted from the app — `progressive` rendered in Tailwind's stock purple, which
 * is not a SportPool colour at all and is one of the few families the palette shim
 * in globals.css deliberately does not alias. Both screens now share this module,
 * so the mode a pool is in looks the same everywhere.
 *
 * Colours come from mobile/components/pools/PoolListItem.tsx via lib/design/tokens.
 */

export type PoolMode = 'full_tournament' | 'progressive' | 'bracket_picker'

const MODE_NAME: Record<PoolMode, string> = {
  full_tournament: 'Full',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
}

// The RN pill recipe: the mode colour as text, over itself at ~12%.
const MODE_TAG_CLASS: Record<PoolMode, string> = {
  full_tournament: 'bg-primary-600/12 text-primary-700',
  progressive: 'bg-success-600/12 text-success-700',
  bracket_picker: 'bg-warning-500/15 text-warning-700',
}

function isPoolMode(mode: string): mode is PoolMode {
  return mode in MODE_NAME
}

/** Short label, for pills and cards where space is tight. */
export function getModeName(mode: string): string {
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

export function getModeLongName(mode: string): string {
  return isPoolMode(mode) ? MODE_LONG_NAME[mode] : mode
}

export function getModeTagClass(mode: string): string {
  return isPoolMode(mode) ? MODE_TAG_CLASS[mode] : 'bg-mist text-muted'
}

/**
 * The 5px full-height bar down the left edge of every pool card in the app.
 * Returned as a CSS gradient so it can go straight into a style prop.
 */
export function getModeStripe(mode: string): string {
  const [from, to] = isPoolMode(mode)
    ? poolModeGradient[mode]
    : poolModeGradient.full_tournament
  return `linear-gradient(to bottom, ${from}, ${to})`
}
