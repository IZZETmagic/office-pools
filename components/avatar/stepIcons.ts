// =============================================================
// Step icons drawn from our own avatar art
// =============================================================
// The seven builder tabs are icon-only, so each glyph carries the whole meaning of its step.
// Five come from Hugeicons; these come from the AVATAR ASSETS THEMSELVES, which is what the note
// above `STEPS` has wanted since the strip was built: "the icon for `Facial hair` could BE a
// beard." Ryan, asking for this one: "we have to make them from what we have."
//
// ⭐ FORMAT: a Hugeicons `IconSvgObject` — an array of [tag, attrs] tuples on a 24×24 viewBox,
// `fill: "currentColor"` so the tab's active/inactive colour drives it exactly like the packaged
// icons. That is why these can sit in the same `STEPS` array with no special-casing at all.
//
// ⚠⚠ DERIVED, NEVER EDITED. The source assets are locked art. Nothing here modifies them: the
// path is lifted verbatim and every coordinate is put through one affine transform to land it in
// a 24×24 box. Regenerate with `scripts/derive-step-icons.py` rather than hand-tuning a number
// — three hand-edits broke approved art once already.
//
// ⚠ The transform is BAKED INTO THE COORDINATES rather than left as a `transform="…"` attribute
// on the path. A transform string would be the smaller diff and is ignored outright by
// react-native-svg, so it would work on web and silently collapse the glyph the day these are
// reused on the phone.
// =============================================================

/** A Hugeicons icon constant: [tag, attributes] tuples, as `HugeiconsIcon` consumes them. */
type IconSvgObject = [string, Record<string, string | number>][]

/**
 * From `assets/character-base/nano/facialhair/assets/moustache.asset.svg`.
 *
 * ⚠ The source bounding box is 696×166 — 4.18:1 — so at full width it stands 5.5 units tall in
 * a 24 box and letterboxes. That is what a moustache IS, not a fitting error; widening it would
 * mean distorting the asset, and the silhouette is the recognisable part. It runs EDGE TO EDGE
 * (span 23, not the 21 a square glyph gets) because the side margin exists to protect a square
 * icon's corners, and spending it here only made an already-thin shape lighter next to
 * full-height neighbours.
 */
export const MoustacheIcon: IconSvgObject = [
  ['path', { d: 'M11.99 10.428 C15.13 7.97 16.921 9.941 19.95 11.123 C21.256 11.633 22.36 10.992 23.5 10.401 C23.375 11.109 23.257 11.575 22.901 12.204 C21.983 13.83 20.36 14.645 18.532 14.736 C17.246 14.8 16.206 14.621 14.98 14.296 C13.734 13.939 13.006 13.514 12.004 12.743 C11.075 13.443 10.421 13.834 9.316 14.203 C5.738 15.395 1.195 14.85 0.5 10.41 C1.045 10.664 1.744 11.088 2.318 11.211 C4.653 11.711 6.261 9.504 8.741 9.276 C10.115 9.202 10.95 9.608 11.99 10.428 Z', fill: 'currentColor', key: '0' }],
]
