// =============================================================
// How a match names and dates itself
// =============================================================
// Pure helpers lifted out of `app/match/[matchId].tsx` when the screen grew a
// header component of its own. Both sides need the same answers, and a match
// that is called one thing in the band and another in the Facts card below it
// is the drift these were extracted to prevent.
//
// Nothing here renders. The components that do — the crest, the clock, the
// scoreline — live with the header, because only the header draws them.
// =============================================================

import { Platform } from 'react-native';

import { formatStageLabel } from '@/lib/stage';
import type { ResultsMatch } from '@/lib/useTournamentMatches';

// The scoreline's face. iOS uses the system-available Menlo / Menlo-Bold;
// Android falls back to the Google-fonts Roboto Mono faces loaded in
// `_layout.tsx` — the native `'monospace'` family on Android has no Bold
// variant, so without this the numbers render visibly thinner than on iOS.
//
// ⚠ Exported rather than declared twice. The band and the cards below it both
// set scorelines, and two copies of a Platform check is how one surface ends up
// a weight lighter than the other on one OS only.
export const MONO_BOLD = Platform.OS === 'ios' ? 'Menlo-Bold' : 'RobotoMono_700Bold';
export const MONO = Platform.OS === 'ios' ? 'Menlo' : 'RobotoMono_400Regular';

export function parsedDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function homeDisplayName(match: ResultsMatch): string {
  return match.homeTeam?.countryName ?? match.homeTeamPlaceholder ?? 'Home';
}

export function awayDisplayName(match: ResultsMatch): string {
  return match.awayTeam?.countryName ?? match.awayTeamPlaceholder ?? 'Away';
}

// ⚠ `homeShortName` / `awayShortName` used to live here, for the chrome row's
// "Arsenal v Chelsea" title. That title was removed — it named the match a
// second time above two crests already doing the job — and these went with it
// rather than being left as two exported functions nothing calls. If a narrow
// row ever needs the short form again, note that `shortName` is null for every
// World Cup team by design and the caller must fall back; see `ResultsTeam`.

export function stageLabel(match: ResultsMatch): string {
  const label = match.groupLetter
    ? `Group ${match.groupLetter}`
    : formatStageLabel(match.stage, match.roundNumber);
  // ⚠ NO "Match #" FOR A LEAGUE FIXTURE. `match_number` there is the season's
  // own 1–380 counter, which is a database detail rather than something anybody
  // says out loud — "Matchweek 12 · Match #118" reads as two competing
  // numberings. Without the matchweek this line read "Regular Season · Match #1",
  // which is the same raw-enum bug the web fixed in `MatchCard.tsx`.
  if (match.roundNumber !== null) return label;
  return `${label} · Match #${match.matchNumber}`;
}

/**
 * The band's eyebrow: which competition, and which round of it.
 *
 * ⚠ THE COMPETITION NAME IS READ, NEVER DERIVED. `competition` is null for the
 * World Cup, where there is only one thing being played and the stage alone
 * says everything — so that case falls back to the stage rather than inventing
 * a name from the absence of a league id. Naming a competition by what it is
 * not is exactly the derivation Decision 14 exists to stop.
 */
export function competitionLine(match: ResultsMatch): string {
  if (!match.competition) return stageLabel(match);
  return `${match.competition} · ${stageLabel(match)}`;
}

/**
 * Is this a two-legged-or-single knockout tie, where the WINNER is what a pick
 * is graded on?
 *
 * ⚠ IT USED TO BE `groupLetter === null`, AND A LEAGUE FIXTURE HAS NO GROUP. So
 * every one of the 380 would have been graded as a knockout — the wrong result
 * badge, and a query against `bracket_picker_knockout_picks` on a fixture id
 * that cannot be in it.
 */
export function isKnockoutTie(match: ResultsMatch): boolean {
  return match.roundNumber === null && match.groupLetter === null;
}

export function formattedFullDate(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formattedTime(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return '--:--';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formattedShortDate(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
