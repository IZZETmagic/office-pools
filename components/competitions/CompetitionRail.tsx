// =============================================================
// A competition's colour and mark, as reusable pieces
// =============================================================
// Both are keyed by `tournaments.external_league_id`, the same key as
// lib/design/competitionColor.ts and the wizard's crest URL — so the three
// things a competition looks like cannot drift apart.
//
// `CompetitionRail` is the bar down the left edge of a pool card.
// `CompetitionMark` is just the mark, at any size and any ink, for the surfaces
// that want the identity without the bar — a pool detail header, a share card,
// a watermark behind a card's corner.
//
// ## Why a competition needs a mark at all
//
// Neither pool card names its competition, so the bar was the whole answer to
// "which league is this?". That does not scale: the bar is a gradient, so every
// colour owns a BAND of lightness rather than a point, and the red and navy
// bands each hold about two competitions. Both were full at seven — La Liga and
// the Bundesliga shipped 0.069 apart in OKLab, which is one colour on a card.
//
// The mark takes colour off the critical path, and is what makes brand-true
// colour affordable again: two near-identical reds are fine once the crest is
// doing the identifying.
// =============================================================

import type { CSSProperties } from 'react'
import { getPoolStripe } from '@/lib/design/poolMode'
import { getCompetitionName } from '@/lib/design/competitionColor'

/**
 * Rail geometry per size. See `.competition-rail`.
 *
 * ⚠ `default` IS MEASURED, NOT CHOSEN. On a 358px phone card the 46px rail costs
 * 47px of body width, clips the "Matchweek" label and wraps the pill row, which
 * makes every card 23px taller. Narrower and the mark drops below the ~36px
 * where the wordmark lockups stop resolving; wider and the card's four KPI tiles
 * start colliding.
 *
 * ⚠ `compact` KNOWINGLY BREAKS THAT FLOOR. The dashboard's strip card is 224px
 * wide — a 46px rail is a fifth of it and wraps the title — so `compact` trades
 * mark legibility for the width. At 22px the badge-shaped marks still read (the
 * Premier League lion, the Champions League starball) and the three wordmark
 * lockups do not: La Liga, the Bundesliga and Ligue 1 render as a shape rather
 * than a readable word. Ryan's call, 2026-08-29, made against a mockup of
 * exactly that. Do not reuse `compact` on a card that can afford `default`.
 */
const SIZES = {
  default: { rail: 46, font: 12 },
  compact: { rail: 30, font: 10 },
} as const

export type RailSize = keyof typeof SIZES


type Competition = { externalLeagueId?: number | null }

/**
 * The competition's two stripe stops as custom properties.
 *
 * Not a composed `background` string: a React `style` prop holds one value per
 * property, and the CSS needs two `background` declarations so the OKLCH
 * gradient can override an sRGB fallback. See app/globals.css.
 */
function stripeVars(externalLeagueId: number | null | undefined): CSSProperties {
  const [from, to] = getPoolStripe({ externalLeagueId })
  return { '--stripe-from': from, '--stripe-to': to } as CSSProperties
}

/**
 * A competition's mark, painted in one colour.
 *
 * ⚠ A MASK, NOT AN `<img>`. The files are white-on-transparent, so masking lets
 * the caller choose the ink rather than trusting every asset to be the right
 * white — which is also what lets the same file serve as a knockout on a
 * coloured rail and as a tinted watermark. It is one mechanism whether the
 * source is a derived PNG or the World Cup's hand-drawn SVG.
 *
 * Returns null when the competition has no mark built, so callers can decide
 * what to show instead. That is a real case, not a defensive branch: a league
 * is a row rather than a deploy, so one can be created in the admin and picked
 * in the wizard before anyone runs
 * `scripts/build-competition-silhouettes.ts` for it.
 */
export function CompetitionMark(_: Competition & {
  width?: number
  height?: number
  ink?: string
  opacity?: number
  className?: string
}) {
  // ⚠ RENDERS NOTHING, ON PURPOSE (2026-09-19). This painted one of the
  // provider's league logos through a CSS mask; the assets are gone and MARKED
  // is empty, so there is nothing to paint. The export stays so callers keep
  // compiling while each one is given its own answer — the rail already has
  // one, below.
  return null
}

/**
 * The bar down the left edge of a pool card: the competition's colour, with its
 * mark knocked out of it.
 *
 * ⚠ THE FALLBACK IS LOAD-BEARING. A competition with no mark yet renders the
 * original 5px colour bar rather than a blank 46px block — see the note on
 * `CompetitionMark` for why that happens in normal operation.
 *
 * Two sizes, and the difference between them is a real trade rather than
 * styling — see `SIZES` above before reaching for `compact`.
 */
export function CompetitionRail({ externalLeagueId, size = 'default' }: Competition & { size?: RailSize }) {
  const name = getCompetitionName(externalLeagueId)
  const stripe = stripeVars(externalLeagueId)

  // ⚠ THE NARROW FALLBACK IS LOAD-BEARING — a competition nobody has named yet
  // renders the original 5px bar rather than a blank 46px block. A league is a
  // row rather than a deploy, so it can be created in the admin and picked in
  // the wizard before anyone names it.
  if (!name) {
    return <span aria-hidden="true" className="w-[5px] shrink-0 pool-stripe" style={stripe} />
  }

  const { rail, font } = SIZES[size]
  return (
    <span
      aria-hidden="true"
      className="shrink-0 competition-rail"
      style={{ ...stripe, width: rail }}
    >
      {/* `writing-mode` + a half turn is the CSS half of what RN does with a
          rotated <Text>; the two files have to agree, and the guard test is
          what keeps them agreeing. */}
      <span
        className="font-black uppercase text-white/95 whitespace-nowrap"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: font,
          letterSpacing: '0.16em',
        }}
      >
        {name}
      </span>
    </span>
  )
}
