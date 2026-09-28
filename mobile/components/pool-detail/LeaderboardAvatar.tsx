import { View, Text as RNText } from 'react-native';

import { MemberAvatar } from '@/components/avatar/MemberAvatar';
import { avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/avatarGradient';
import { fontFamilies, useTheme } from '@/theme';

import { initialsOf } from './leaderboard-shared';

// =============================================================
// A member's face on a leaderboard
// =============================================================
// ⭐ ONE COMPONENT FOR EVERY BOARD. `LeaderboardRow` is shared by the World Cup, Pick'em,
// Predict the Table and Last Man Standing, and `LeaderboardPodium` sits above it — so this is
// the only place a leaderboard decides what a person looks like. Showdown has its own board and
// was done separately.
//
// ⚠⚠ THE ROWS DO NOT VIRTUALISE. Every leaderboard renders with `.map()`, not a `FlatList`, so
// a 192-entry World Cup board mounts all 192 rows at once. At ~31 KB and ~1.16 ms to compose
// each, that is ~5.9 MB and ~223 ms if every row draws a face — which is exactly the
// "needs a level-of-detail strategy that does not exist" the web's `MemberAvatar` warns about.
// `FACE_LIMIT` is that strategy. See its note.
// =============================================================

/**
 * How far down a board faces are composed. Below this, initials.
 *
 * ⭐ CHOSEN FROM THE DISTRIBUTION, NOT PICKED OUT OF THE AIR. Measured across every pool:
 * average 8 entries, p95 35, and only 15 pools of 638 exceed 50. So this is invisible for
 * virtually every board that exists, and it caps the worst case at ~1.5 MB instead of ~5.9 MB.
 *
 * ⚠ It is a RENDER cap, not a data one — the config is already in the payload for every row, so
 * raising it costs nothing but compose time. The honest fix is virtualising the lists, at which
 * point this constant should be deleted rather than raised.
 *
 * ⚠ Ranks are 1-based, so row `rank` 50 is the fiftieth and still gets a face.
 */
export const FACE_LIMIT = 50;

export function LeaderboardAvatar({
  userId,
  name,
  avatarBuild,
  avatarColour,
  size,
  rank,
}: {
  userId: string | null;
  name: string;
  avatarBuild: unknown;
  avatarColour: string | null;
  size: number;
  /**
   * Where this row sits, 1-based. Past `FACE_LIMIT` the face is skipped and the initials stand.
   *
   * ⚠ Pass `1` for anything that is not in a long list — a podium place, a single member. The
   * cap exists for the tail of a board, not as a general gate.
   */
  rank: number;
}) {
  const theme = useTheme();

  /**
   * ⚠ A member's colour, not the slot's. Derived from their id so the same person is the same
   * colour on the board, on their profile, and on a pool card. There is no duel here to resolve
   * against, so — unlike the Showdown header — no shifted index applies.
   */
  const index = userId ? avatarIndexFor(userId, avatarColour) : null;
  const ground = index != null ? avatarBackgroundFor(index) : theme.colors.mist;

  const initials = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: ground,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: Math.round(size * 0.36),
          /**
           * ⚠ A LITERAL INK FROM THE GROUND, NOT A THEME COLOUR. The circle is the member's
           * colour, which is the SAME value in light and dark — so anything theme-aware painted
           * on it is guaranteed to fail in one of the two. Measured on this palette: white text
           * fails on all 22 grounds; `groundInkFor` passes on all 22.
           */
          color: index != null ? groundInkFor(index) : theme.colors.slate,
        }}
      >
        {initialsOf(name)}
      </RNText>
    </View>
  );

  if (!userId || rank > FACE_LIMIT) return initials;

  return (
    <MemberAvatar
      userId={userId}
      avatarBuild={avatarBuild}
      avatarColour={avatarColour}
      size={size}
      fallback={initials}
    />
  );
}
