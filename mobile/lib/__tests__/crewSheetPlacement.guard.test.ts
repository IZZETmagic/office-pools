import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// =============================================================
// A gorhom sheet sits at the screen's root, never inside the ScrollView
// =============================================================
// Ryan, 2026-10-02: on the crew page, Add people "doesn't slide up far enough —
// it's cut off". The sheet was rendered inside Shell's ScrollView, so it sized
// and positioned itself against the scrolling content instead of the screen.
// Shell now takes it through `overlay`, a sibling of the ScrollView.
// =============================================================

const src = readFileSync(join(__dirname, '../../app/profile/crews/[id].tsx'), 'utf8');

describe('crew page', () => {
  it('renders AddPeopleSheet through Shell’s overlay slot, once', () => {
    expect(src.match(/<AddPeopleSheet\b/g)?.length).toBe(1);
    expect(src).toMatch(/overlay=\{\s*<AddPeopleSheet\b/);
  });
  it('Shell puts the overlay after the ScrollView, not inside it', () => {
    expect(src).toMatch(/<\/ScrollView>\s*\{overlay\}/);
  });
});
