import { Image } from 'expo-image';
import { View } from 'react-native';

import { ClubBar } from '@/components/ui/ClubBar';
import { clubIdFromCrestUrl } from '@/lib/design/clubColors';
import { useTheme } from '@/theme';

/**
 * A team's mark: a club's colour bar, or a national flag.
 *
 * ⚠⚠ ONE FIELD CARRIES TWO KINDS OF THING. `/api/users/:id/fixtures` maps a
 * club's `crest_url` into `flag_url` — the shaping that route exists for — so
 * every surface downstream gets a World Cup flag and a Premier League badge in
 * the same property, and has to tell them apart itself.
 *
 * The badges came out on 2026-09-19 (drafts/2026-09-13_ip_exposure_audit.md
 * §5). The flags did not: a national flag is public domain and ours came from
 * flagcdn, so World Cup surfaces should be unchanged if one is ever opened.
 *
 * ⚠ THE URL IS THE TEST, and no extra field was needed for it.
 * `clubIdFromCrestUrl` matches the provider's numeric last segment
 * (`…/teams/42.png`); a flag is `…/gb.png`, which has no number.
 *
 * ⚠⚠ AND THIS IS WHY IT IS A COMPONENT. The branch was written six times over
 * two days and two of the copies were WRONG in the same way: `match/[matchId]`
 * drew a crest into a 22×15 flag box with `contentFit="cover"`, cropping a
 * third off the top and bottom of every league badge. Nothing errored — the
 * badge just arrived beheaded. A shared mark cannot drift like that.
 */
export function TeamMark({
  url,
  /** How tall the club's bar should be. Flags keep their own 3:2 box. */
  height = 30,
  flagWidth = 22,
  flagHeight = 15,
}: {
  url: string | null | undefined;
  height?: number;
  flagWidth?: number;
  flagHeight?: number;
}) {
  const theme = useTheme();

  if (url && clubIdFromCrestUrl(url) !== null) {
    return <ClubBar url={url} height={height} />;
  }

  if (url) {
    // ⚠ `cover` IS RIGHT HERE and only here: a flag really is 3:2, so it fills
    // the box exactly. It was wrong for a crest, which is what the note above
    // is about.
    return (
      <Image
        source={{ uri: url }}
        style={{ width: flagWidth, height: flagHeight, borderRadius: 2 }}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }

  // ⚠ THE SLOT SURVIVES AN UNKNOWN TEAM, so a placeholder fixture does not
  // shunt everything beside it out of line with the rows above.
  return (
    <View
      style={{
        width: flagWidth,
        height: flagHeight,
        borderRadius: 2,
        backgroundColor: theme.colors.mist,
      }}
    />
  );
}
