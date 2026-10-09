import { describe, expect, it } from 'vitest';

import { alignedTabOffset, minContentHeight, SYNC_TAB_HEADER } from '../collapsibleTabs';

// The header folds over 180pt in these cases — a round number, not a real one.
// Both screens measure theirs on the device.
const D = 180;

describe('alignedTabOffset', () => {
  it('part folded: the incoming tab sits exactly at the fold, wherever it was', () => {
    expect(alignedTabOffset(90, 0, D)).toBe(90); // was at its top — moved down to match
    expect(alignedTabOffset(90, 600, D)).toBe(90); // was read further down — brought back up
  });

  it('fully open: every incoming tab goes to its top, or the header would fold on arrival', () => {
    expect(alignedTabOffset(0, 600, D)).toBe(0);
  });

  it('fully folded: a tab above the line drops to it, so content starts under the folded header', () => {
    expect(alignedTabOffset(D, 40, D)).toBe(D);
    expect(alignedTabOffset(900, 0, D)).toBe(D); // the active tab is deep; the header is still just "folded"
  });

  it('fully folded: a tab already read past the line keeps its place', () => {
    expect(alignedTabOffset(D, 1200, D)).toBe(1200);
    expect(alignedTabOffset(500, 1200, D)).toBe(1200);
  });

  it('a pull-to-refresh bounce reads as fully open, not as a negative fold', () => {
    expect(alignedTabOffset(-60, 300, D)).toBe(0);
  });

  it('a header that does not fold leaves every tab alone (other pool modes, or not yet measured)', () => {
    expect(alignedTabOffset(250, 40, 0)).toBe(40);
    expect(alignedTabOffset(250, 40, Number.NaN)).toBe(40);
  });

  it('never moves the header: the aligned offset folds it exactly as far as before', () => {
    // The header reads the active tab's offset clamped to [0, D]. Whatever the
    // incoming tab was doing, after alignment its clamped offset equals the
    // header's — which is the whole promise of the feature.
    const fold = (y: number) => Math.min(Math.max(y, 0), D);
    for (const header of [-30, 0, 1, 45, 90, 179, 180, 181, 400]) {
      for (const tab of [-20, 0, 60, 179, 180, 500, 2000]) {
        expect(fold(alignedTabOffset(header, tab, D))).toBe(fold(header));
      }
    }
  });
});

describe('minContentHeight', () => {
  it.skipIf(!SYNC_TAB_HEADER)('is the measured viewport plus the measured fold — any phone, any header', () => {
    expect(minContentHeight(640, D)).toBe(820); // a small phone
    expect(minContentHeight(812, 236)).toBe(1048); // a tall one with a taller header
  });

  it('adds nothing until both have been measured, or when the header does not fold', () => {
    expect(minContentHeight(0, D)).toBeUndefined();
    expect(minContentHeight(700, 0)).toBeUndefined();
  });

  // ⚠ Written so the backout does not need a test edit: flipping SYNC_TAB_HEADER
  // to false makes this assert "no extra room" instead of failing.
  it('adds no room at all once the switch is off', () => {
    expect(minContentHeight(640, D)).toBe(SYNC_TAB_HEADER ? 820 : undefined);
  });
});
