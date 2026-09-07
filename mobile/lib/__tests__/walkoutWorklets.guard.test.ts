import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================
// A worklet may only call worklets
// =============================================================
// `ShowdownWalkout` runs eleven animated styles on the UI thread. Everything
// they touch has to be serialisable to that thread: plain values, and functions
// Reanimated has workletized. A plain JS helper captured in the closure does not
// throw at build time, does not fail typecheck, and does not warn — it kills the
// app the instant the component mounts.
//
// That is not hypothetical. The first version of the walkout reached for
//
//     const beat = (n) => BEATS.find((b) => b.num === n)!
//
// inside every `useAnimatedStyle`, and read `Haptics.ImpactFeedbackStyle.Light`
// inside a `useAnimatedReaction` — which captures the whole native module.
// Ryan pressed Reveal on the first live matchweek and the app crashed, having
// never drawn a frame of a ceremony that took a day to build.
//
// ⚠ NOTHING ELSE CATCHES THIS. tsc is happy (the types are fine on either
// thread), eslint is happy, and the module imports cleanly. The failure is a
// runtime serialisation error on a device — the one place this project cannot
// test, because there are no simulator destinations here.
//
// So this reads the source instead. Crude, and the same technique the web's
// `bandStateOrder.guard.test.ts` uses for the same reason: the bug is invisible
// to every other tool in the box.
// =============================================================

const src = readFileSync(
  resolve(process.cwd(), 'mobile/components/pool-detail/ShowdownWalkout.tsx'),
  'utf8',
);

/**
 * The body of every `useAnimatedStyle(...)` / `useAnimatedReaction(...)` call.
 *
 * ⚠ Brace-counted rather than regexed, because these bodies contain object
 * literals, arrow functions and nested calls. A lazy `[\s\S]*?}` would stop at
 * the first `}` of a style object and pass everything that matters.
 */
function animatedBodies(): string[] {
  const out: string[] = [];
  const re = /use(?:AnimatedStyle|AnimatedReaction)\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 1;
    const start = i;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === '(') depth++;
      else if (c === ')') depth--;
      i++;
    }
    out.push(src.slice(start, i));
  }
  return out;
}

describe('the walkout’s animated callbacks stay on the UI thread', () => {
  it('finds the animated callbacks at all', () => {
    // If this drops to zero the rest of the file is asserting nothing.
    expect(animatedBodies().length).toBeGreaterThanOrEqual(8);
  });

  it.each([
    ['BEATS', 'the beat table is an array — use the hoisted START / END lookups'],
    ['beat(', 'the `beat(n)` helper was a plain JS closure and crashed the app'],
    ['Haptics.', 'reading the enum inside a worklet captures the native module'],
    ['.find(', 'Array.prototype.find on a captured array is not workletized'],
  ])('never references %s', (needle, why) => {
    const guilty = animatedBodies().filter((b) => b.includes(needle));
    expect(guilty, `${needle} — ${why}`).toEqual([]);
  });
});

describe('the values the worklets DO use are resolved on the JS thread', () => {
  it('hoists the beat boundaries to plain-number lookups', () => {
    expect(src).toMatch(/const START: Record<number, number> = \{\}/);
    expect(src).toMatch(/const END: Record<number, number> = \{\}/);
  });

  it('hoists the three haptic styles to module constants', () => {
    for (const c of ['TAP_LIGHT', 'TAP_MEDIUM', 'TAP_HEAVY']) {
      expect(src).toContain(`const ${c} = Haptics.ImpactFeedbackStyle.`);
    }
  });

  it('⚠ still fires a haptic on every clue, the threshold and the name', () => {
    // The hoisting must not have quietly dropped a beat. Three clue taps share
    // one call, so that is three references in total.
    const bodies = animatedBodies().join('\n');
    expect(bodies).toContain('TAP_LIGHT');
    expect(bodies).toContain('TAP_HEAVY');
    expect(bodies).toContain('TAP_MEDIUM');
  });
});
