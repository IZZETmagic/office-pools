// =============================================================
// The face crop — a whole avatar cut down to the head, for a small circle
// =============================================================
// ⚠ TWO COPIES, ONE TEXT: `lib/avatar/faceCrop.ts` (web) and `mobile/lib/avatar/faceCrop.ts`
// (app) — mobile is a separate npm project and cannot import the web's. A guard
// (lib/design/__tests__/avatarFaceMirror.guard.test.ts) fails if they differ, so edit both.
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
 * is being relied on. (The web draws it as an <img>, where the same is simply true.)
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
const FULL_VIEWBOX = new RegExp(`viewBox="0 0 ${CANVAS} ${CANVAS}"`);

export function cropToFace(svg: string): string {
  return svg.replace(FULL_VIEWBOX, CROPPED_VIEWBOX);
}
