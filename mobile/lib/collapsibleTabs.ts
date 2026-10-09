// =============================================================
// ONE HEADER, MANY TABS — where an off-screen tab sits so the header holds still
// =============================================================
// Ryan, 2026-10-09: on the Showdown screen and the Match Detail Centre, scroll
// the Duel tab until the header is half folded, swipe to The Room, and the
// header used to spring fully open — because the header followed whichever tab
// was on screen, and The Room was still at its top.
//
// The standard pattern (Android's collapsing toolbar, react-native-collapsible-
// tab-view, FotMob, an X profile): the collapse belongs to the SCREEN. Before a
// tab slides in, it is scrolled to line up with the header as it already is, so
// the header has nothing to do when the tab arrives.
//
// ## The rule
//
// The header's position IS a scroll offset — both headers interpolate the active
// tab's `scrollY` over `[0, distance]`. So:
//
//   * PART FOLDED (anywhere from fully open up to the line): the incoming tab
//     must sit at EXACTLY that offset. Any other offset would move the header
//     the moment it became the active tab. A tab that had been read further
//     down comes back up to match — every app that does this pays that.
//   * FULLY FOLDED: the incoming tab must be at least at the line, so its
//     content starts right under the collapsed header. A tab already read past
//     the line keeps its place.
//
// ## And the room to hold it
//
// A tab shorter than its viewport cannot scroll at all, so it could never hold
// the header folded and the rule above would be a request the ScrollView
// refuses. `minContentHeight` gives every tab enough content to scroll exactly
// the collapse distance. ⚠ BOTH INPUTS ARE MEASURED ON THE DEVICE — the page's
// own viewport from `onLayout`, the distance from the header's own layout — so
// it follows the phone, the safe areas, Dynamic Type and a header that changes
// height between phases. No constant here knows what size a screen is.
//
// ⚠ PURE ON PURPOSE. No React Native import (the root vitest cannot resolve
// one), and the functions carry `'worklet'` so the Reanimated plugin can run the
// SAME code on the UI thread that the tests run in Node.
// =============================================================

/**
 * ⚠⚠ THE BACKOUT SWITCH. `false` restores the behaviour before 2026-10-09
 * exactly: every tab keeps its own offset, the header follows whichever tab is
 * on screen (so it reopens over a tab at its top), and no tab gets extra room.
 * One line, then an OTA. See `CollapsibleTabPage`.
 */
export const SYNC_TAB_HEADER = true;

/**
 * Where an off-screen tab should sit so the header does not move when it
 * becomes the active tab.
 *
 * @param headerOffset the header's current fold, as a scroll offset — the
 *   active tab's `scrollY`. May be negative during a pull-to-refresh bounce.
 * @param tabOffset where the incoming tab is now.
 * @param distance how far the header folds, measured. 0 means it does not fold.
 */
export function alignedTabOffset(headerOffset: number, tabOffset: number, distance: number): number {
  'worklet';
  // Nothing folds (every non-Showdown pool, or a header not yet measured):
  // there is no header state to preserve, so leave the tab where it is.
  if (!(distance > 0)) return tabOffset;
  const fold = Math.min(Math.max(headerOffset, 0), distance);
  if (fold < distance) return fold;
  return Math.max(tabOffset, distance);
}

/**
 * The least a tab's content may be, so it can always scroll far enough to hold
 * the header fully folded — or undefined to leave the content its natural size.
 *
 * ⚠ CONTENT HEIGHT INCLUDES THE TAB'S PADDING (Yoga is border-box), which is
 * where the header's own expanded height lives. So `viewport + distance` is
 * exactly a maximum scroll offset of `distance`.
 *
 * @param viewport the tab's measured visible height. 0 until layout has run.
 */
export function minContentHeight(viewport: number, distance: number): number | undefined {
  if (!SYNC_TAB_HEADER || !(distance > 0) || !(viewport > 0)) return undefined;
  return viewport + distance;
}
