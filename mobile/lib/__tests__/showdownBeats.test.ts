import { describe, expect, it } from 'vitest';

import {
  BEATS,
  CLUE_AT,
  CLUE_MS,
  NAME_AT,
  THRESHOLD_AT,
  WALKOUT_MS,
  beatAt,
  beatProgress,
  beatValue,
  cluesShown,
  type BeatSeg,
} from '../showdownBeats';

// =============================================================
// The walkout's clock
// =============================================================
// The timing is the part of this ceremony nothing else can check. A wrong
// colour is obvious on the first play; a beat that starts 200ms late reads as
// "it feels a bit off" and survives for months.
//
// The haptics are the reason these are asserted rather than eyeballed. They
// fire off `CLUE_AT` and `NAME_AT`, and the web's note on this port is explicit
// that a buzz landing a beat after the thing it describes is worse than no
// buzz — so the constants the visuals use and the constants the haptics use
// have to be provably the same list.
// =============================================================

const linear = (t: number) => t;

describe('the beat table is continuous', () => {
  it('starts at zero', () => {
    expect(BEATS[0].startMs).toBe(0);
  });

  it('has no gaps and no overlaps', () => {
    // A gap freezes the picture; an overlap makes two beats fight over one
    // value. Neither throws.
    for (let i = 1; i < BEATS.length; i++) {
      expect(BEATS[i].startMs, `beat ${BEATS[i].num} does not begin where ${BEATS[i - 1].num} ends`)
        .toBe(BEATS[i - 1].endMs);
    }
  });

  it('runs every beat forwards', () => {
    for (const b of BEATS) expect(b.endMs, `beat ${b.num}`).toBeGreaterThan(b.startMs);
  });

  it('ends at WALKOUT_MS', () => {
    expect(WALKOUT_MS).toBe(6700);
  });
});

describe('⚠ the spec’s own proportions survive the merge', () => {
  // MOTION_SPEC.md sets these four and gives a reason for each. Adding the
  // clues stretched the SETUP; it must not have touched the payoff.
  it.each([
    [5, 300, 'the climax is the shortest beat — "quick hits feel powerful"'],
    [6, 500, 'full reveal'],
    [7, 600, 'hero shot, name plates rise'],
    [8, 700, 'lock card needs hang time — it is the share frame'],
  ])('keeps beat %i at %ims (%s)', (num, dur) => {
    const b = BEATS.find((x) => x.num === num)!;
    expect(b.endMs - b.startMs).toBe(dur);
  });

  it('still opens on a 400ms establish', () => {
    expect(BEATS[0].endMs - BEATS[0].startMs).toBe(400);
  });
});

describe('the three clues', () => {
  it('there are exactly three', () => {
    expect(CLUE_AT).toHaveLength(3);
    expect(BEATS.filter((b) => b.clue !== undefined).map((b) => b.clue)).toEqual([1, 2, 3]);
  });

  it('each gets the full reading window', () => {
    // Ryan rejected 1200ms on the web as too short to read. These are 1400.
    for (const b of BEATS.filter((x) => x.clue !== undefined)) {
      expect(b.endMs - b.startMs, `clue ${b.clue}`).toBe(CLUE_MS);
    }
  });

  it('rides inside beats 2 to 4 — the approach, not the payoff', () => {
    expect(BEATS.filter((b) => b.clue !== undefined).map((b) => b.num)).toEqual([2, 3, 4]);
  });

  it('⚠ every clue has landed before the threshold', () => {
    // The deduction has to be OVER before the figures cross into the light.
    // A clue arriving after the climax is a fact nobody is still reading.
    for (const at of CLUE_AT) expect(at).toBeLessThan(THRESHOLD_AT);
  });

  it('⚠ the name lands after all three, not at the climax', () => {
    // Naming them at the threshold would make the clues decoration.
    expect(NAME_AT).toBeGreaterThan(CLUE_AT[2] + CLUE_MS);
    expect(NAME_AT).toBeGreaterThan(THRESHOLD_AT);
  });
});

describe('⚠ the haptics and the visuals read one clock', () => {
  it('CLUE_AT is derived from BEATS rather than restated', () => {
    // If someone hard-codes a second array, this catches it the moment the
    // beats move — which is the only time it matters.
    expect(CLUE_AT).toEqual(BEATS.filter((b) => b.clue !== undefined).map((b) => b.startMs));
  });

  it('cluesShown counts a clue on its own first frame', () => {
    expect(cluesShown(CLUE_AT[0] - 1)).toBe(0);
    expect(cluesShown(CLUE_AT[0])).toBe(1);
    expect(cluesShown(CLUE_AT[1])).toBe(2);
    expect(cluesShown(CLUE_AT[2])).toBe(3);
    expect(cluesShown(WALKOUT_MS)).toBe(3);
  });
});

describe('beatAt', () => {
  it('clamps below zero to the first beat', () => {
    expect(beatAt(-50).num).toBe(1);
  });

  it('⚠ holds the last beat at exactly WALKOUT_MS', () => {
    // The final frame IS the share preview. Falling off the end here would
    // blank it on completion.
    expect(beatAt(WALKOUT_MS).num).toBe(8);
    expect(beatAt(WALKOUT_MS + 5000).num).toBe(8);
  });

  it('picks the beat containing the instant', () => {
    expect(beatAt(0).num).toBe(1);
    expect(beatAt(399).num).toBe(1);
    expect(beatAt(400).num).toBe(2);
    expect(beatAt(4600).num).toBe(5);
    expect(beatAt(6699).num).toBe(8);
  });
});

describe('beatProgress', () => {
  it('runs 0 to 1 across the beat', () => {
    const b = BEATS[1]; // 400 - 1800
    expect(beatProgress(400, b)).toBe(0);
    expect(beatProgress(1100, b)).toBeCloseTo(0.5, 2);
    expect(beatProgress(1800, b)).toBe(1);
  });

  it('clamps outside it', () => {
    const b = BEATS[1];
    expect(beatProgress(0, b)).toBe(0);
    expect(beatProgress(9999, b)).toBe(1);
  });
});

describe('beatValue', () => {
  const segs: BeatSeg[] = [
    { start: 0, end: 100, easing: linear, from: 0, to: 10 },
    { start: 200, end: 300, easing: linear, from: 10, to: 30 },
  ];

  it('holds the first value before the first segment', () => {
    expect(beatValue(-10, [{ start: 50, end: 100, easing: linear, from: 5, to: 9 }])).toBe(5);
  });

  it('eases across a segment', () => {
    expect(beatValue(50, segs)).toBeCloseTo(5, 5);
  });

  it('⚠ HOLDS between segments rather than interpolating across the gap', () => {
    // This is the whole reason it exists instead of Reanimated's `interpolate`.
    // A straight line through the boundaries would flatten every curve the spec
    // names — the anticipation would not ease in and the climax would not
    // overshoot. The beats would be right and the motion would be wrong.
    expect(beatValue(150, segs)).toBe(10);
  });

  it('holds the last value after the end', () => {
    expect(beatValue(9999, segs)).toBe(30);
  });

  it('survives a zero-length segment as a step, not a divide by zero', () => {
    const step: BeatSeg[] = [{ start: 100, end: 100, easing: linear, from: 0, to: 1 }];
    expect(beatValue(50, step)).toBe(0);
    expect(Number.isNaN(beatValue(100, step))).toBe(false);
    expect(beatValue(100, step)).toBe(1);
  });

  it('applies the easing rather than ignoring it', () => {
    const eased: BeatSeg[] = [
      { start: 0, end: 100, easing: (t) => t * t, from: 0, to: 100 },
    ];
    // Linear would be 50 here; ease-in-quad is 25.
    expect(beatValue(50, eased)).toBeCloseTo(25, 5);
  });

  it('answers 0 for an empty track rather than throwing', () => {
    expect(beatValue(10, [])).toBe(0);
  });
});
