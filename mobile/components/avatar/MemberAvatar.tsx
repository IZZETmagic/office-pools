import { useMemo } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { composeAvatar } from '@/lib/avatar/compose';
import { readStoredAvatarBuild, toAvatarConfig } from '@/lib/avatar/storedConfig';
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/avatarGradient';
import { useAvatarAssets } from '@/lib/useAvatarAssets';

// =============================================================
// Somebody else's avatar, small
// =============================================================
// ⭐ The phone half of the web's `components/avatar/MemberAvatar.tsx`, and the same shape:
// PROGRESSIVE, NEVER BLOCKING. The art is a 563 KB fetch, so this draws the `fallback` — today's
// initials — immediately and swaps when the bundle lands. Nobody waits on a network request to
// see a pool card.
//
// ⭐ COMPOSED LOCALLY, NOT FETCHED. `/api/avatar/me` serves the member their OWN finished SVG,
// which is right for one avatar on a profile. A list is a different problem: a card carries three
// members, so server composition would be three requests and ~94 KB of SVG per card. Measured
// instead: the stored config is 327 bytes and composing it here costs 1.16 ms. The config travels,
// the pixels are made on the phone.
//
// ⚠⚠ IT MUST NEVER THROW. `readStoredAvatarBuild` returns null for anything this build cannot
// draw, and `composeAvatar` throws on exactly one field — an unknown `base`. Preview and
// production serve different asset bundles from the same url against the same rows, so a config
// saved on dev after an asset rename WILL be read by an older bundle on someone's phone. The
// fallback is the designed answer to that, not an error boundary.
// =============================================================

/**
 * ⭐⭐ THE CROP, AND IT IS MEASURED RATHER THAN EYEBALLED. The composed avatar is a full
 * head-and-shoulders figure on a 2048² canvas; at 24 px the body is a few specks, so the circle
 * shows the head.
 *
 * ⚠⚠ THE CROP IS ANCHORED ON THE FACE, NOT ON THE SILHOUETTE. The obvious approach — find the
 * widest row and call it the head — is wrong, and measurably so: for `f06-spacebuns` the widest
 * row is the BUNS at y296, and for `f13-longstraight` it is hair at the SHOULDERS at y1256. Hair
 * volume ranges from 1248 to 1888 across the set. What is stable is the face: its centre sits at
 * x≈1020 in every configuration, because the skull comes from the four locked bases.
 *
 * ⚠ 1700 was chosen by rendering all 25 hair styles at 1450 / 1700 / 1950 and looking. At 1450 the
 * face is biggest but a mohawk is decapitated and both spacebuns are cut; at 1950 everything fits
 * but the face shrinks and the shirt intrudes. 1700 keeps every style intact with the face still
 * dominant — so DO NOT tighten this without re-rendering the tall styles.
 */
const CROP_BOX = 1700;
const CANVAS = 2048;
const SCALE = CANVAS / CROP_BOX;
/** The face's centre on the canvas, as a fraction of its height. */
const FACE_CY = 840 / CANVAS;

export function MemberAvatar({
  userId,
  avatarBuild,
  avatarColour,
  size,
  fallback,
}: {
  userId: string;
  avatarBuild: unknown;
  avatarColour: string | null;
  size: number;
  /** Drawn while the art loads, and forever for a member who has not built a face. */
  fallback: React.ReactNode;
}) {
  // ⚠ Unconditional, before any early return — adding a second condition later would otherwise
  // break the rules of hooks.
  const { assets } = useAvatarAssets(avatarBuild != null);

  const svg = useMemo(() => {
    if (!assets || avatarBuild == null) return null;
    const build = readStoredAvatarBuild(avatarBuild, assets);
    if (!build) return null;
    const ground = avatarBackgroundFor(avatarIndexFor(userId, avatarColour));
    return composeAvatar(toAvatarConfig(build, ground), assets);
    // ⚠ Keyed on the CONFIG, not on a parent object. `avatarBuild` arrives from the query as a
    // stable reference per fetch, so this recomposes when the member's face changes and not on
    // every scroll frame.
  }, [assets, avatarBuild, userId, avatarColour]);

  if (!svg) return <>{fallback}</>;

  const rendered = size * SCALE;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // ⚠ Load-bearing. The SVG is drawn LARGER than this box and positioned outside it; without
        // the clip the neighbouring avatars in the stack would be painted over.
        overflow: 'hidden',
      }}
    >
      <SvgXml
        xml={svg}
        width={rendered}
        height={rendered}
        style={{
          position: 'absolute',
          left: size / 2 - rendered / 2,
          // ⚠ Works out to +0.6% of size — very nearly centred, but not exactly, and the
          // difference is a face sitting slightly low in the circle. Kept as the real expression
          // rather than rounded to zero.
          top: size / 2 - FACE_CY * rendered,
        }}
      />
    </View>
  );
}
