// =============================================================
// A competition's colour and mark, down the left edge of a pool card
// =============================================================
// The RN half of components/competitions/CompetitionRail.tsx. Same geometry,
// same fallback, same reason for existing: neither pool card names its
// competition, so the rail is the whole answer to "which league is this?".
//
// ⚠ WHAT THIS REPLACED WAS WRONG, not merely plainer. The card's 5px bar was
// coloured by `prediction_mode`, and MODE_GRADIENT only held the three World
// Cup modes — so every Premier League pool rendered in the World Cup's blue.
// The stripe became the COMPETITION's colour on the web on 2026-08-29 (Ryan's
// call) and the mode moved to a pill; this is mobile catching up.
//
// ## Two ways a mark is drawn, and why
//
// Six competitions ship as white-on-transparent PNGs, so they render straight
// onto the coloured rail with no tinting. The World Cup is an inline SVG: the
// provider returns a generic placeholder shield for league 1, so its mark was
// drawn by hand and there is no raster to derive. Web knocks both out of the
// rail with a CSS mask; RN has no mask, so the PNG is drawn as-is (it is
// already white) and the SVG carries its own fill.
// =============================================================

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { getCompetitionMarkPng, getPoolStripe, isWorldCupMark } from '@/lib/design/competition';

/**
 * Rail geometry per size, from the web's SIZES — both numbers are MEASURED
 * rather than chosen.
 *
 * ⚠ `compact` KNOWINGLY TRADES MARK LEGIBILITY FOR WIDTH. At a 22px mark the
 * badge-shaped marks still read (the Premier League lion, the Champions League
 * starball) and the three wordmark lockups do not — La Liga, the Bundesliga and
 * Ligue 1 resolve as a shape rather than a readable word. On web that trade was
 * made for the dashboard's 224px strip card; the home tab's card is 220px, so
 * it is the same trade for the same reason. Ryan's call, 2026-09-02.
 *
 * ⚠ Do not reuse `compact` on a card that can afford `default`.
 */
const SIZES = {
  default: { rail: 46, markW: 36, markH: 66, padV: 6, padH: 5 },
  compact: { rail: 30, markW: 22, markH: 44, padV: 5, padH: 4 },
} as const;

export type RailSize = keyof typeof SIZES;

/**
 * The World Cup's mark, inlined.
 *
 * ⚠ THE SOURCE OF TRUTH IS public/competitions/1.svg — this is a copy, and
 * `lib/design/__tests__/competitionMirror.guard.test.ts` fails if the two drift. It is inlined
 * rather than bundled because Metro has no SVG transformer configured, and
 * adding one to move 1.4 kB is a worse trade than this comment.
 *
 * ⚠ THE CUTS ARE A MASK. The slivers that make it read as a trophy are stroked
 * black inside a <mask>; if react-native-svg ever drops maskUnits support this
 * renders as a plain white slab, which is a visible failure rather than a
 * silent one.
 */
const WORLD_CUP_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="19 12 62 167">
  <mask id="t" maskUnits="userSpaceOnUse" x="19" y="12" width="62" height="167">
    <g fill="#fff">
      <circle cx="50" cy="44" r="30"/>
      <path d="M27 62 C 30 98, 38 126, 42 146 L58 146 C 62 126, 70 98, 73 62 Z"/>
      <rect x="37" y="146" width="26" height="8" rx="2"/>
      <rect x="30" y="157" width="40" height="8" rx="2"/>
      <rect x="22" y="168" width="56" height="9" rx="3"/>
    </g>
    <g fill="none" stroke="#000" stroke-width="5" stroke-linecap="round">
      <path d="M43 146 C 41 112, 38 84, 46 60 C 51 46, 60 34, 70 30"/>
      <path d="M57 144 C 60 112, 64 86, 60 66"/>
      <path d="M30 60 C 27 44, 33 28, 44 20"/>
    </g>
  </mask>
  <rect x="19" y="12" width="62" height="167" fill="#fff" mask="url(#t)"/>
</svg>`;

type Props = {
  /** `tournaments.external_league_id`. Null renders the unthemed slate. */
  externalLeagueId?: number | null;
  size?: RailSize;
};

/**
 * The bar down the left edge of a pool card.
 *
 * ⚠ THE NARROW FALLBACK IS LOAD-BEARING. A competition with no mark renders the
 * original 5px colour bar rather than a blank 30px block — and that is a real
 * case, not a defensive branch: a league is a row rather than a deploy, so one
 * can be created in the admin and picked in the wizard before anyone builds a
 * mark for it.
 */
export function CompetitionRail({ externalLeagueId, size = 'compact' }: Props) {
  const stripe = getPoolStripe(externalLeagueId);
  const png = getCompetitionMarkPng(externalLeagueId);
  const isWorldCup = isWorldCupMark(externalLeagueId);

  if (!png && !isWorldCup) {
    return (
      <LinearGradient
        colors={stripe}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={{ width: 5, height: '100%' }}
      />
    );
  }

  const { rail, markW, markH, padV, padH } = SIZES[size];

  return (
    <LinearGradient
      colors={stripe}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={{
        width: rail,
        height: '100%',
        paddingVertical: padV,
        paddingHorizontal: padH,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {isWorldCup ? (
        <SvgXml xml={WORLD_CUP_MARK} width={markW} height={markH} />
      ) : (
        <Image
          source={png!}
          style={{ width: markW, height: markH }}
          resizeMode="contain"
          // The asset is already white-on-transparent, so it needs no tint —
          // the same file the web masks, drawn directly.
          fadeDuration={0}
        />
      )}
    </LinearGradient>
  );
}
