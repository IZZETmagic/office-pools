import { describe, expect, it } from 'vitest';

import {
  formTone,
  isThinSample,
  outcomeTone,
  splitShares,
  THIN_SAMPLE,
} from '../scoutTone';

// =============================================================
// The colour grammar, as rules rather than as a palette
// =============================================================
// These are the assertions that make the grammar a thing you can break a build
// on. The COLOURS are not tested here — they live in the kit, and the guard test
// proves nothing outside the kit reaches for them.
// =============================================================

describe('isThinSample', () => {
  it('refuses a percentage below five and allows one at five', () => {
    expect(isThinSample(4)).toBe(true);
    expect(isThinSample(THIN_SAMPLE)).toBe(false);
    expect(isThinSample(11)).toBe(false);
  });

  it('⚠ treats zero as thin — there is no rate over nothing', () => {
    expect(isThinSample(0)).toBe(true);
  });

  it('⚠ the floor is FIVE, matching MIN_RATE_SAMPLE on the server', () => {
    // Restated rather than imported (lib/scouting is web-side). If the server's
    // floor moves, this is the test that should fail and force the other to move.
    expect(THIN_SAMPLE).toBe(5);
  });
});

describe('outcomeTone', () => {
  it('reads the scoreline as played, home side first', () => {
    expect(outcomeTone(2, 1)).toBe('win');
    expect(outcomeTone(1, 1)).toBe('draw');
    expect(outcomeTone(0, 2)).toBe('loss');
  });

  it('⚠ 0–0 is a draw, not a loss for both', () => {
    expect(outcomeTone(0, 0)).toBe('draw');
  });
});

describe('formTone', () => {
  it('maps the three letters and nothing else', () => {
    expect(formTone('W')).toBe('win');
    expect(formTone('D')).toBe('draw');
    expect(formTone('L')).toBe('loss');
  });
});

describe('splitShares', () => {
  it('keeps the raw counts as flex so the bar is exact', () => {
    const [home, draw, away] = splitShares(6, 2, 3);
    expect(home.flex).toBe(6);
    expect(draw.flex).toBe(2);
    expect(away.flex).toBe(3);
  });

  it('tones the three segments home / level / away, in that order', () => {
    expect(splitShares(1, 1, 1).map((s) => s.tone)).toEqual(['home', 'level', 'away']);
  });

  it('rounds each label from the one division', () => {
    const [home, draw, away] = splitShares(41, 17, 42);
    expect(home.pct).toBe(41);
    expect(draw.pct).toBe(17);
    expect(away.pct).toBe(42);
  });

  it('⚠ an empty split yields null percentages, never NaN and never a confident 0%', () => {
    // A fixture nobody has picked and a pairing never played are real states.
    // "0% / 0% / 0%" is a claim about a denominator that does not exist, and
    // `0/0` renders as "NaN%" — React draws both without complaining.
    const shares = splitShares(0, 0, 0);
    expect(shares.map((s) => s.pct)).toEqual([null, null, null]);
    expect(shares.every((s) => s.flex === 0)).toBe(true);
  });

  it('⚠ a zero segment inside a real split is 0%, NOT null', () => {
    // Nobody picked the draw is a fact; nobody picked anything is an absence.
    // Collapsing the two would report a real zero as missing data.
    const [home, draw, away] = splitShares(7, 0, 4);
    expect(draw.pct).toBe(0);
    expect(home.pct).toBe(64);
    expect(away.pct).toBe(36);
  });

  it('⚠ the labels can still total 99 or 101 — the BAR is what must be exact', () => {
    // Three thirds round to 33 each. That is fine on the labels and would be a
    // visible gap in the bar, which is why flex carries the counts.
    const shares = splitShares(1, 1, 1);
    expect(shares.reduce((s, x) => s + (x.pct ?? 0), 0)).toBe(99);
    expect(shares.reduce((s, x) => s + x.flex, 0)).toBe(3);
  });
});
