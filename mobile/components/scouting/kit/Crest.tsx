import { Image } from 'react-native';

// =============================================================
// A club badge
// =============================================================
// ⚠ `resizeMode="contain"`, the pattern `leagueTableRow` and the duel card
// already use. Crests arrive at wildly different aspect ratios; `cover` crops
// the badge and `stretch` distorts it.
//
// ⚠ IT IS DECORATIVE. The club's name sits beside it in every caller, so alt
// text would announce the same thing twice — the same call the duel card makes.
//
// ⚠⚠ NO PLACEHOLDER WHEN THERE IS NO CREST. `league_clubs.crest_url` is nullable
// and the importer fills it from the provider, so a club can arrive without one.
// A reserved empty square beside a name reads as an image that FAILED to load;
// the name simply moves left instead.
// =============================================================

export function Crest({
  url,
  size,
}: {
  url: string | null | undefined;
  size: number;
}) {
  // ⚠ `!url` CATCHES `undefined` TOO, not just null — an older API may not send
  // the field at all. See the `== null` rule the dossier files carry.
  if (!url) return null;
  return (
    <Image
      alt=""
      source={{ uri: url }}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
