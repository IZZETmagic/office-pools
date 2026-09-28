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
const CANVAS = 2048;
const CROP_BOX = 1700;
/** The face's centre on the canvas. Stable across every configuration. */
const FACE_CX = 1024;
const FACE_CY = 840;

/**
 * ⭐⭐ THE CROP IS DONE IN THE SVG, NOT IN THE LAYOUT, and that is the whole point.
 *
 * ⚠⚠ THE FIRST VERSION RENDERED THE SVG OVERSIZED INSIDE A ROUND `overflow: 'hidden'`
 * VIEW AND IT DID NOT CLIP. On the device the avatar came out visibly WIDER than the
 * initials circles beside it — the oversized child simply painted past its parent.
 * Rewriting the viewBox makes the crop part of the image itself, so the child is
 * exactly `size` square, there is nothing to overflow, and no RN clipping behaviour
 * is being relied on.
 *
 * ⚠ The top clamps at 0. Centred on the face the box would start at y=-10, which is
 * off-canvas and outside the background rect, leaving a transparent sliver. Clamping
 * moves the face down by 10 of 2048 units — 0.12px at 24px, invisible.
 */
const CROP_X = Math.max(0, FACE_CX - CROP_BOX / 2);
const CROP_Y = Math.max(0, FACE_CY - CROP_BOX / 2);
const CROPPED_VIEWBOX = `viewBox="${CROP_X} ${CROP_Y} ${CROP_BOX} ${CROP_BOX}"`;

/**
 * ⚠ Replaces the FIRST viewBox only — the root element's. `composeAvatar` emits one
 * root `<svg>` and paths beneath it, so there is no nested viewBox to catch, and a
 * global replace would be wrong the day there is.
 */
const FULL_VIEWBOX = new RegExp(`viewBox="0 0 ${CANVAS} ${CANVAS}"`)

function cropToFace(svg: string): string {
  return svg.replace(FULL_VIEWBOX, CROPPED_VIEWBOX);
}

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

  const svg = useMemo(() => {
    if (!assets || avatarBuild == null) return null;
    const build = readStoredAvatarBuild(avatarBuild, assets);
    if (!build) return null;
    const ground = groundOverride ?? avatarBackgroundFor(avatarIndexFor(userId, avatarColour));
    return cropToFace(composeAvatar(toAvatarConfig(build, ground), assets));
    // ⚠ Keyed on the CONFIG, not on a parent object. `avatarBuild` arrives from the query as a
    // stable reference per fetch, so this recomposes when the member's face changes and not on
    // every scroll frame.
  }, [assets, avatarBuild, userId, avatarColour, groundOverride]);

  if (!svg) return <>{fallback}</>;

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
      <SvgXml xml={svg} width={size} height={size} />
    </View>
  );
}
