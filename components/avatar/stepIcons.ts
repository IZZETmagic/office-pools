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

/**
 * From `assets/character-base/nano/glasses/assets/s01-classic.asset.svg`, FRAME PATH ONLY.
 *
 * ⚠⚠ The asset carries three paths — frame, lens tint and glint — and an icon is ONE colour.
 * Flattened together under `currentColor` they merge into a featureless slab; the frame alone is
 * the silhouette that reads as glasses. Checked by rendering it on its own at 300px AND at 60px
 * before wiring it, because a shape that survives the first size can still die at the second.
 *
 * ⚠ 1080×366, so 2.95:1 — wide, and like the moustache it runs edge to edge (span 23) rather
 * than taking the 21 a square glyph gets.
 */
export const GlassesIcon: IconSvgObject = [
  ['path', { d: 'M13.045 9.36 L10.947 9.355 L10.714 8.995 L10.51 8.782 L10.197 8.569 L9.801 8.401 L9.434 8.305 L8.946 8.235 L7.157 8.124 L5.378 8.109 L3.889 8.139 L2.615 8.209 L1.145 8.341 L0.824 8.42 L0.641 8.542 L0.538 8.727 L0.5 9.021 L0.502 9.626 L0.553 9.909 L0.643 10.031 L0.741 10.118 L1.067 10.259 L1.188 10.333 L1.301 10.472 L1.369 10.631 L1.416 10.868 L1.448 11.392 L1.567 12.491 L1.744 13.618 L1.848 14.016 L1.966 14.334 L2.115 14.63 L2.306 14.905 L2.543 15.156 L2.835 15.377 L3.101 15.527 L3.391 15.627 L3.834 15.727 L4.341 15.799 L5.135 15.861 L5.885 15.893 L6.482 15.895 L7.459 15.861 L8.064 15.816 L8.542 15.755 L8.991 15.659 L9.349 15.539 L9.579 15.412 L9.839 15.218 L10.065 15 L10.301 14.685 L10.495 14.329 L10.648 13.944 L10.772 13.539 L10.872 13.126 L11.151 11.471 L11.241 11.145 L11.328 11.036 L11.488 10.936 L11.718 10.851 L11.931 10.817 L12.225 10.834 L12.438 10.891 L12.642 11.017 L12.759 11.162 L12.853 11.449 L13.015 12.525 L13.156 13.234 L13.298 13.765 L13.456 14.189 L13.697 14.662 L13.954 15.009 L14.268 15.303 L14.564 15.49 L14.977 15.652 L15.535 15.763 L16.504 15.855 L17.506 15.893 L18.643 15.878 L19.504 15.821 L20.222 15.716 L20.816 15.559 L20.995 15.486 L21.152 15.392 L21.564 15.052 L21.834 14.719 L22.03 14.361 L22.201 13.876 L22.328 13.262 L22.492 12.012 L22.582 10.917 L22.644 10.621 L22.712 10.461 L22.812 10.337 L22.959 10.252 L23.234 10.144 L23.366 10.028 L23.455 9.899 L23.5 9.583 L23.491 8.976 L23.449 8.716 L23.396 8.597 L23.33 8.518 L23.221 8.441 L23.104 8.39 L22.816 8.331 L21.387 8.207 L19.171 8.113 L17.872 8.105 L16.575 8.137 L15.22 8.222 L14.564 8.312 L14.035 8.465 L13.673 8.652 L13.381 8.91 Z', fill: 'currentColor', key: '0' }],
]

/**
 * From `assets/character-base/nano/bases/base-neck-100.svg` — the HEAD and BOTH EARS, nothing
 * else. Ryan: "the outline or shape of our avatars head (only ears on it)", which is the same
 * rule the hair tiles already follow: no eyes, no mouth, no nose, only the ears.
 *
 * ⚠⚠ SELECTED BY INDEX, because fill cannot separate these parts. The head shares
 * `rgb(254,205,180)` with the NECK, and the ears share `rgb(245,178,150)` with the neck shadow
 * and the NOSE — only position tells them apart. That is safe here and nowhere else, because the
 * bases are locked art; the script asserts the file still has nine paths and fails loudly rather
 * than silently drawing a nose.
 *
 * ⚠ NO `fillRule`. The ears overlap the head, so even-odd would punch holes where they meet.
 * Nonzero — the default, hence its absence — unions the three subpaths into one silhouette.
 *
 * ⚠ 1.01:1, so unlike the other two derived glyphs this one is square and takes the standard
 * span 21 and the default 26px box, sitting with the packaged icons rather than beside them.
 */
export const HeadIcon: IconSvgObject = [
  ['path', { d: 'M3.258 10.058 C3.316 10.051 3.355 10.045 3.411 10.033 C3.439 9.987 3.427 7.556 3.451 7.23 C3.648 4.6 5.456 2.394 8.034 1.762 C8.341 1.686 8.654 1.639 8.97 1.622 C9.338 1.597 9.795 1.61 10.171 1.61 L12.212 1.61 L13.981 1.61 C14.538 1.61 15.062 1.594 15.615 1.69 C16.347 1.816 17.048 2.082 17.681 2.472 C19.064 3.316 20.046 4.711 20.402 6.283 C20.671 7.474 20.543 8.699 20.569 9.912 C20.57 9.959 20.561 10.027 20.595 10.053 C20.587 10.064 20.579 10.075 20.572 10.086 C20.565 10.367 20.567 10.719 20.566 10.996 L20.565 12.824 C20.565 13.131 20.553 13.53 20.573 13.829 L20.595 13.861 L20.568 13.887 L20.577 15.737 C20.577 16.067 20.582 16.546 20.551 16.869 C20.411 18.242 19.797 19.524 18.814 20.493 C18.091 21.218 17.192 21.743 16.206 22.017 C15.778 22.138 15.411 22.185 14.971 22.22 C14.946 22.222 14.938 22.365 14.936 22.393 C14.933 22.338 14.931 22.286 14.924 22.231 C14.85 22.204 13.961 22.22 13.82 22.22 L10.282 22.22 C9.95 22.22 9.448 22.216 9.098 22.225 C9.089 22.232 9.08 22.239 9.071 22.247 C9.023 22.181 8.819 22.201 8.707 22.191 C8.26 22.149 7.888 22.057 7.465 21.916 C6.568 21.609 5.756 21.093 5.096 20.411 C4.176 19.468 3.598 18.244 3.455 16.934 C3.413 16.52 3.429 16.061 3.426 15.64 C3.42 15.046 3.422 14.452 3.43 13.858 L3.434 11.453 C3.434 11.062 3.453 10.445 3.424 10.077 C3.382 10.054 3.312 10.06 3.258 10.058 Z M20.595 10.053 C20.814 10.065 21.002 10.076 21.213 10.143 C22.02 10.401 22.543 11.21 22.497 12.051 C22.47 12.561 22.242 13.039 21.863 13.381 C21.493 13.714 21.082 13.836 20.595 13.861 L20.573 13.829 C20.553 13.53 20.565 13.131 20.565 12.824 L20.566 10.996 C20.567 10.719 20.565 10.367 20.572 10.086 C20.579 10.075 20.587 10.064 20.595 10.053 Z M3.43 13.858 C3.319 13.855 3.2 13.854 3.091 13.835 C1.609 13.578 0.994 11.815 1.978 10.689 C2.304 10.317 2.765 10.09 3.258 10.058 C3.312 10.06 3.382 10.054 3.424 10.077 C3.453 10.445 3.434 11.062 3.434 11.453 L3.43 13.858 Z', fill: 'currentColor', key: '0' }],
]
