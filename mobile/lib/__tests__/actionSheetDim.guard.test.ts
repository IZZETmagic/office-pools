import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// =============================================================
// The action sheet's dim fades in place — only the sheet slides
// =============================================================
// Ryan, 2026-10-02, on the crew page's member menu: "the background darkening is
// awkward". `components/ui/ActionSheet.tsx` used `<Modal animationType="slide">`,
// which slides the Modal's WHOLE content — the dark backdrop rose up the screen as
// a slab behind the sheet, unlike every gorhom sheet in the app, whose backdrop
// fades. A source guard, because the regression is one prop and looks fine in
// code review.
// =============================================================

const src = readFileSync(join(__dirname, '../../components/ui/ActionSheet.tsx'), 'utf8');

describe('ActionSheet', () => {
  it('never lets the Modal slide its content (the dim would slide with it)', () => {
    expect(src).not.toMatch(/animationType="slide"/);
    expect(src).toMatch(/animationType="none"/);
  });
  it('the dim is its own full-screen layer that never takes a touch', () => {
    expect(src).toMatch(/pointerEvents="none"[\s\S]{0,120}StyleSheet\.absoluteFill/);
  });
  it('animates on the native driver', () => {
    expect(src.match(/useNativeDriver: true/g)?.length).toBe(2);
  });
});
