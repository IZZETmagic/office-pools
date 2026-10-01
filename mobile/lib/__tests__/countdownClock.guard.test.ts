import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// =============================================================
// The countdown's "has this target changed?" compare must be NaN-safe
// =============================================================
// `useCountdownClock` derives state from a prop during render — React's documented
// pattern — by comparing the target it last saw against the one it has now:
//
//     if (!Object.is(seen.target, target)) setSeen({ ... })
//
// ## ⚠⚠ WHY THIS IS A TEST AND NOT A COMMENT
//
// `target` is `NaN` whenever there is nothing to count to, which is not an edge
// case: a sealed week before the 24-hour hold has a floor, a settled duel, a bye.
// And `NaN !== NaN` is ALWAYS TRUE. Written with `!==`, the guard fires on every
// render, which sets state, which renders — "Too many re-renders. React limits the
// number of renders to prevent an infinite loop", thrown from the Showdown band in
// every phase that has no clock, which is most of them.
//
// That shipped to the production OTA on 2026-09-30 and took the band down. It is a
// one-character class of mistake with no type-level protection and no runtime
// warning until it throws, and the phase that triggers it is the one a developer
// is least likely to be looking at.
//
// ## ⚠ WHY IT GREPS THE SOURCE RATHER THAN RENDERING THE HOOK
//
// The hook imports `react-native-reanimated`, which resolves out of
// `mobile/node_modules` — the root vitest config knows nothing about it, and the
// failure would be an unresolved import rather than anything informative. See the
// note in `vitest.config.ts`. A source guard is the same shape the avatar-asset and
// tab-order guards use, and it catches the exact regression that happened.
// =============================================================

const SOURCE = readFileSync(join(__dirname, '..', 'useCountdown.ts'), 'utf8');

describe('useCountdownClock keeps its target compare NaN-safe', () => {
  it('compares the remembered target with Object.is', () => {
    expect(SOURCE).toContain('!Object.is(seen.target, target)');
  });

  it('never compares the target with === or !==, which NaN defeats', () => {
    // Deliberately matches the comparison only, not the words "target" elsewhere:
    // `seen.target !== target` and `target !== seen.target` are both the bug.
    const unsafe = /\b(seen\.)?target\s*(===|!==)\s*(seen\.)?target\b/;
    expect(SOURCE).not.toMatch(unsafe);
  });

  it('still guards the no-target case everywhere it branches on it', () => {
    // `Number.isNaN` is correct for "is there a target at all" and must stay —
    // the Object.is fix is about CHANGE detection, not about these.
    expect(SOURCE).toContain('Number.isNaN(target)');
    expect(SOURCE).toContain("running: !Number.isNaN(target)");
  });
});
