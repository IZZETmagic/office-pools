// =============================================================
// The shape of every control on the Pools tab's header and filter sheet
// =============================================================
// One height, and radii derived from it rather than picked per control, so a
// shape inside another shape curves in step with it.
//
// ## ⚠ THE CONCENTRIC RULE
//
// A rounded shape inset inside another takes the outer radius MINUS the inset:
//
//     inner radius = outer radius − gap between their edges
//
// Get it wrong and the gap between the two curves is visibly fatter at the
// corner than along the straight edge — the inner shape looks pasted on rather
// than nested. So the selected segment inside a track is not "a pill", it is
// `CONTROL_RADIUS − TRACK_INSET`; the competition badge inside its chip is
// `CONTROL_RADIUS − SELECTION_BORDER − BADGE_GAP`. The numbers below are the
// rule written out once, and the components only read them.
// =============================================================

/** Every tappable control: tracks, chips, sort buttons, the filter button. */
export const CONTROL_HEIGHT = 44;
/** Fully rounded at that height. */
export const CONTROL_RADIUS = CONTROL_HEIGHT / 2;

/** How far a segmented control's selected thumb sits inside its track. */
export const TRACK_INSET = 4;
export const THUMB_HEIGHT = CONTROL_HEIGHT - TRACK_INSET * 2;
/** 22 − 4 = 18: concentric with the track. */
export const THUMB_RADIUS = CONTROL_RADIUS - TRACK_INSET;

/**
 * The ring that marks a selected chip, tile or sort button.
 *
 * ⚠ EVERY STATE CARRIES IT — transparent when unselected — so selecting
 * something changes a colour and never a size. A border that appears only on
 * selection pushes the label 2pt inward and the row jumps under the finger.
 */
export const SELECTION_BORDER = 2;

/** The competition badge inside its chip, and the gap around it. */
export const BADGE_GAP = 4;
export const BADGE_SIZE = CONTROL_HEIGHT - (SELECTION_BORDER + BADGE_GAP) * 2;
/** 22 − 2 − 4 = 16: concentric with the chip's inner edge. */
export const BADGE_RADIUS = CONTROL_RADIUS - SELECTION_BORDER - BADGE_GAP;

/** Game tiles are cards, not controls: `radii.md`, the card radius. */
export const TILE_HEIGHT = 72;
