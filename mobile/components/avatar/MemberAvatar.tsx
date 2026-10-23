import { useMemo } from 'react';
import { View } from 'react-native';
import { parse, SvgAst } from 'react-native-svg';

import { composeAvatar } from '@/lib/avatar/compose';
import { cachedFace } from '@/lib/avatar/faceCache';
import { cropToFace } from '@/lib/avatar/faceCrop';
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

// ⭐ The head-and-shoulders → head crop, and why it is 1700 at (1024, 840), lives in
// lib/avatar/faceCrop.ts — shared word for word with the web, which crops Banter the same way.

export function MemberAvatar({
  userId,
  avatarBuild,
  avatarColour,
  size,
  ground: groundOverride,
  fallback,
}: {
  userId: string;
  avatarBuild: unknown;
  avatarColour: string | null;
  size: number;
  /**
   * A ground colour that OVERRIDES the one derived from the member.
   *
   * ⭐⭐ THIS EXISTS FOR DUELS. Two members can both be teal — one picked it, the other hashed
   * into it — and `duelColourIndices` moves whichever side has the weaker claim so the two do
   * not face each other in one colour. Once it has moved a side there is no user id left to
   * ask: the answer is an INDEX, resolved from both entry ids together. So a duel passes
   * `avatarBackgroundFor(index)` here rather than letting this component re-derive a colour
   * that would undo the shift. It is the same reason `toAvatarConfig` takes a resolved colour.
   *
   * ⚠ Leave it unset everywhere else. The member's own colour is the right answer outside a
   * duel, and hardcoding one here would make the same person two colours in two places.
   */
  ground?: string;
  /** Drawn while the art loads, and forever for a member who has not built a face. */
  fallback: React.ReactNode;
}) {
  // ⚠ Unconditional, before any early return — adding a second condition later would otherwise
  // break the rules of hooks.
  const { assets } = useAvatarAssets(avatarBuild != null);

  const face = useMemo(() => {
    if (!assets || avatarBuild == null) return null;
    const ground = groundOverride ?? avatarBackgroundFor(avatarIndexFor(userId, avatarColour));
    // ⭐ ONCE PER PERSON, NOT PER ROW (lib/avatar/faceCache.ts). Banter draws a member beside
    // every run of their messages and a leaderboard draws the whole pool; composing and PARSING
    // the SVG is the cost, so the parsed tree is kept and every row renders the same one. This
    // is exactly what `SvgXml` does — `parse` then `SvgAst` — minus repeating the parse per mount.
    return cachedFace(assets, avatarBuild, ground, () => {
      const build = readStoredAvatarBuild(avatarBuild, assets);
      if (!build) return null;
      // ⚠ Never throws (see the header): `SvgXml` caught a bad parse and drew its fallback, so
      // this does too. `composeAvatar` is inside for the same reason.
      try {
        return parse(cropToFace(composeAvatar(toAvatarConfig(build, ground), assets)));
      } catch (err) {
        console.warn('[MemberAvatar] could not draw a stored avatar', err);
        return null;
      }
    });
    // ⚠ Keyed on the CONFIG, not on a parent object. `avatarBuild` arrives from the query as a
    // stable reference per fetch, so this recomposes when the member's face changes and not on
    // every scroll frame.
  }, [assets, avatarBuild, userId, avatarColour, groundOverride]);

  if (!face) return <>{fallback}</>;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        // ⚠ The SVG is already cropped to a square of the face, so this rounds the
        // square into a circle. It is NOT doing the crop — see `cropToFace`, and the
        // note there about why relying on this to clip an oversized child failed.
        overflow: 'hidden',
      }}
    >
      <SvgAst ast={face} override={{ width: size, height: size }} />
    </View>
  );
}
