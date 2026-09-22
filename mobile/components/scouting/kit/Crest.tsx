import { ClubBar } from '@/components/ui';

// =============================================================
// A club's mark, in the scouting kit
// =============================================================
// ⚠ IT WAS A CREST UNTIL 2026-09-19 — the provider's artwork, removed with
// every other one (drafts/2026-09-13_ip_exposure_audit.md §5). The export keeps
// its name because four surfaces import it and the thing it stands for has not
// changed: this is "the club, as a mark, in the dossier".
//
// ⚠ THE URL IS STILL THE INPUT even though nothing draws it. `ClubBar` reads
// the provider's club id out of the last path segment to find the colour, so
// the call sites did not have to learn a new prop.
//
// ⚠ `size` IS NOW A HEIGHT, not a square. A crest needed width and height; a
// bar is 6pt wide wherever it appears, and the callers' 18 / 24 / MARK values
// read naturally as how TALL the mark is. Nothing had to change at the call
// sites for that either.
//
// ⚠⚠ NO MARK WHEN THERE IS NO CLUB. `league_clubs.crest_url` is nullable and
// the importer fills it from the provider, so a club can arrive without one. A
// reserved empty slot beside a name reads as something that FAILED to load; the
// name simply moves left instead. That is why this returns null rather than
// `ClubBar`'s neutral bar — the dossier has no column to keep straight.
// =============================================================

export function Crest({
  url,
  /**
   * The fixture's verdict for this side, where there is a fixture.
   *
   * ⚠ ONLY THE SURFACES THAT SHOW BOTH CLUBS PASS THIS. `fixturePalette` needs
   * to see the pair to decide whether the away side changes kit, so the header
   * and the form card work it out and hand it down. The club-bias rows in the
   * dossier show one club at a time against no opponent, so they pass nothing
   * and get the club's own colour.
   */
  colour,
  size,
}: {
  url: string | null | undefined;
  colour?: string | null;
  size: number;
}) {
  // ⚠ `!url` CATCHES `undefined` TOO, not just null — an older API may not send
  // the field at all. See the `== null` rule the dossier files carry.
  if (!url) return null;
  return <ClubBar url={url} colour={colour} height={size} />;
}
