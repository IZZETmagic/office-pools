// =============================================================
// THE WALKOUT'S CLOCK — beats, clues, and the curve between them
// =============================================================
// The timing half of the Showdown reveal, split out from the component so it
// can be tested. `assets/showdown-storyboard/MOTION_SPEC.md` is the source for
// the beat structure and the easing names; this is that table in code, plus the
// three clues the web ceremony puts inside it.
//
// ⚠ NOTHING HERE MAY IMPORT REACT NATIVE — not even `Easing`. The root vitest
// runner reaches `mobile/**/__tests__` but resolves nothing out of
// `mobile/node_modules`, so a single Reanimated import would take the whole
// file out of test coverage. Beats carry an easing NAME; the component maps
// names to `Easing.bezier(...)` where Reanimated is actually available.
//
// ## ⚠ WHY THIS IS 6.7s AND THE SPEC SAYS 4.0s
//
// Ryan's call, 2026-09-06: merge the two designs that existed. The RN
// playground (2026-06-27) had eight cinematic beats and no clues; the web
// ceremony (2026-09-01) had three clues and no walk. The web's argument for the
// clues is the stronger one — *"the pleasure is the deduction, not the
// surprise"* — and the spec's argument for the beats is the stronger one about
// camera. So the clues ride INSIDE beats 2 to 4, while the figures approach.
//
// That costs time, and it has to. Ryan, 2026-09-01, rejecting 1200ms per clue:
// *"give it enough time for the user to read them"* — a clue has to be found on
// screen, parsed, and then compared against your own record before it means
// anything. The web settled on 1900ms with nothing else moving. Here there IS
// something else moving, so these are 1400ms: shorter than the web's because
// the walk carries the attention between them, longer than the spec's whole
// setup because reading is not watching.
//
// ⚠ BEATS 5 THROUGH 8 KEEP THE SPEC'S DURATIONS EXACTLY — 300 / 500 / 600 /
// 700. Only the setup stretches. The spec is explicit that the climax is the
// shortest beat *("climax beats should be fast — quick hits feel powerful, long
// climaxes feel pretentious")* and that the lock card needs its 700ms of hang
// time, and neither of those reasons is weakened by adding clues earlier.
//
// ⚠ IT LANDS ON 6700ms, WHICH IS THE WEB CEREMONY'S OWN LENGTH. That is
// arithmetic rather than design — 400 + 3×1400 + 300 + 500 + 600 + 700 — but it
// means the length is one Ryan has already watched and signed off.
//
// ⚠ THE SPEC'S 4s CONSTRAINT IS THEREFORE BROKEN ON PURPOSE, and its stated
// reason — *"short enough not to skip on the second view"* — is answered
// differently instead: there is no second view. `last_reveal_seen_at` (136)
// makes the walkout fire once per duel, and Ryan's 2026-09-02 call means there
// is no replay button. Skip is present throughout for anybody who disagrees.
// =============================================================

/** The easing names from MOTION_SPEC.md. The component owns the curves. */
export type EasingName =
  | 'ambient'
  | 'anticipate'
  | 'reveal'
  | 'climax'
  | 'settle'
  | 'hero'
  | 'graphic';

export type Beat = {
  num: number;
  label: string;
  startMs: number;
  endMs: number;
  easing: EasingName;
  /** Which clue lands with this beat, if any. */
  clue?: 1 | 2 | 3;
};

/** How long a clue stays legible. See the header for why it is not 1900. */
export const CLUE_MS = 1400;

export const BEATS: Beat[] = [
  { num: 1, label: 'Establish', startMs: 0, endMs: 400, easing: 'ambient' },
  { num: 2, label: 'Atmosphere build', startMs: 400, endMs: 1800, easing: 'anticipate', clue: 1 },
  { num: 3, label: 'Silhouettes emerge', startMs: 1800, endMs: 3200, easing: 'ambient', clue: 2 },
  { num: 4, label: 'Stride forward', startMs: 3200, endMs: 4600, easing: 'reveal', clue: 3 },
  { num: 5, label: 'Threshold', startMs: 4600, endMs: 4900, easing: 'climax' },
  { num: 6, label: 'Full reveal', startMs: 4900, endMs: 5400, easing: 'settle' },
  { num: 7, label: 'Hero shot', startMs: 5400, endMs: 6000, easing: 'hero' },
  { num: 8, label: 'Lock card', startMs: 6000, endMs: 6700, easing: 'graphic' },
];

export const WALKOUT_MS = BEATS[BEATS.length - 1].endMs;

/**
 * When each clue arrives, in order.
 *
 * ⚠ DERIVED FROM `BEATS`, NEVER RESTATED. The web's own note on this ceremony
 * is explicit that the haptics must fire off the same constants the visuals use
 * — *"two clocks for one ceremony drift, and a buzz that lands a beat after the
 * thing it is describing is worse than no buzz"*. A second array of clue times
 * here would be exactly that second clock.
 */
export const CLUE_AT: number[] = BEATS.filter((b) => b.clue !== undefined).map((b) => b.startMs);

/**
 * The moment the name is allowed on screen.
 *
 * ⚠ BEAT 7, NOT BEAT 5. The threshold is when the figures cross into the light;
 * the name plate rises after it. Naming them at the climax would make the three
 * clues decoration — you would read the answer before you had finished
 * deducing it, which is the same mistake the web band made by putting the
 * opponent's face next to the Reveal button.
 */
export const NAME_AT = BEATS.find((b) => b.num === 7)!.startMs;

/** The moment the camera shakes and the flare peaks. */
export const THRESHOLD_AT = BEATS.find((b) => b.num === 5)!.startMs;

// -------------------------------------------------------------------------

/**
 * A segment of an animated value: hold `from` until `start`, ease to `to`
 * across the window, hold `to` afterwards.
 */
export type BeatSeg = {
  start: number;
  end: number;
  /** Resolved by the component — a plain `(t: number) => number` worklet. */
  easing: (t: number) => number;
  from: number;
  to: number;
};

/**
 * The eased value of a segmented track at time `t` (milliseconds).
 *
 * ⚠ A WORKLET. It runs on the UI thread inside `useAnimatedStyle`, so it may
 * not close over anything that is not itself a worklet or a plain value — the
 * easing functions are passed IN for that reason rather than looked up here.
 *
 * ⚠ AND IT HOLDS, RATHER THAN INTERPOLATING BETWEEN SAMPLE POINTS. That is the
 * whole reason it exists instead of Reanimated's `interpolate`: a straight line
 * through the beat boundaries would flatten every curve the spec names, so the
 * anticipation would not ease in and the climax would not overshoot. The beats
 * would still be the right lengths and the motion would be wrong.
 */
export function beatValue(t: number, segments: BeatSeg[]): number {
  'worklet';
  if (segments.length === 0) return 0;
  let last = segments[0].from;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (t < seg.start) return last;
    if (t < seg.end) {
      const span = seg.end - seg.start;
      // A zero-length segment is a step, not a division by zero.
      const local = span <= 0 ? 1 : (t - seg.start) / span;
      return seg.from + (seg.to - seg.from) * seg.easing(local);
    }
    last = seg.to;
  }
  return last;
}

/**
 * Which beat is on screen at `t`.
 *
 * ⚠ CLAMPED AT BOTH ENDS rather than returning null off the edges. `t` can sit
 * exactly on `WALKOUT_MS` when the animation completes, and a null there would
 * blank the lock card on its final frame — the one frame that is the share
 * preview.
 */
export function beatAt(t: number): Beat {
  if (t <= 0) return BEATS[0];
  for (const b of BEATS) if (t < b.endMs) return b;
  return BEATS[BEATS.length - 1];
}

/**
 * How far through its own window beat `b` is at `t`, 0–1. Linear — this is for
 * labelling and progress, not for motion.
 */
export function beatProgress(t: number, b: Beat): number {
  const span = b.endMs - b.startMs;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (t - b.startMs) / span));
}

/**
 * How many clues have landed by `t`.
 *
 * ⚠ `>=`, SO A CLUE IS "LANDED" ON ITS OWN FIRST FRAME. Using `>` would hold
 * the first clue back by one frame at 400ms, which is invisible on screen and
 * would put the haptic a frame ahead of the thing it is announcing.
 */
export function cluesShown(t: number): number {
  let n = 0;
  for (const at of CLUE_AT) if (t >= at) n++;
  return n;
}
