# The Skia corridor — bringing the Remotion tunnel to React Native

Companion to `MOTION_SPEC.md`. Written 2026-09-06 against `remotion/DuelReveal.tsx`,
`mobile/components/pool-detail/ShowdownWalkout.tsx` and `mobile/lib/showdownBeats.ts`.

**Status: SPEC ONLY — nothing here is built. One decision is open (§7).**

---

## 1. What this replaces, and why

The RN walkout has no corridor. It has a **portal**: a static floor gradient and a single
neon arch scaled `0.55 → 2.95` off the `dolly` track.

That is the exact failure the Remotion twin already diagnosed and fixed:

> ⚠ THIS WAS CONCENTRIC `<div>`s. Scaled rectangles only grow — nothing is ever further
> away, so there is no parallax, no depth falloff and no camera. It read, correctly, as a
> portal rather than a hallway.
> — `remotion/DuelReveal.tsx`, on the version before Three.js

Web fixed it with React Three Fiber. Remotion fixed it with `@remotion/three`. **Mobile is
the only surface still drawing the pre-fix version**, and it is the surface the mode is
named after.

This spec does not port the Remotion *file*. It ports the **corridor's geometry and
projection**, which are a page of arithmetic, into Skia primitives.

### Non-goals

- **Not** playing the rendered MP4 in the app. That was considered and rejected
  2026-09-06: a 30s on-demand render against an instant tap, pre-rendering would put a
  file naming somebody's future opponent at a public Blob URL before the seal opens, and
  a video cannot carry the per-gate haptics that sound was cut in favour of.
- **Not** changing what the walkout *says*. The clue ladder, the beats and the
  once-only rule (migration 136) are untouched.
- **Not** a second scoring or timing authority. `showdownBeats.ts` stays the clock.

---

## 2. 🔴 Blocker: Skia is declared but not installed

```
mobile/package.json   →  "@shopify/react-native-skia": "2.2.12"
mobile/node_modules/@shopify/   →  empty directory
```

Consequences, all of which must be settled **before** any of this is worth building:

1. **It cannot be typechecked or tested locally** until `npm i` inside `mobile/` actually
   resolves it.
2. **It is native code.** It cannot ship in an OTA update. A Skia corridor needs an EAS
   dev/production build, and per the standing note native builds cannot be produced or
   visually verified on this machine.
3. **The existing `<SkiaLensFlare/>` in `mobile/app/showdown-reveal-playground.tsx` has
   been rendering `null`** — its `try { require(...) } catch {}` guard exists precisely
   for this, and the comment says so. Whether the *deployed* build has Skia linked cannot
   be determined from the repo; it depends on whether an EAS build ran after the
   dependency was added.

**First action, before anything else: confirm whether the current native runtime has Skia
linked.** If it does not, this is a native-build change, not an OTA, and that changes its
cost and its release path entirely.

---

## 3. The projection

The corridor reads as a corridor because of perspective and fog. Both are exact formulas,
not tuning.

Remotion's camera is R3F's default, verified in the installed source
(`@react-three/fiber/dist/…: new THREE.PerspectiveCamera(75, 0, 0.1, 1000)`, then
`camera.position.z = 5`). `@remotion/three`'s `ThreeCanvas` passes through and does not
override it.

- **Field of view: 75°, vertical.** Three's `fov` is the vertical angle.
- **Camera standoff: 5 world units** in front of the ring field, looking down −z.

Focal length in pixels:

```
f = (H / 2) / tan(fov / 2)
  = (H / 2) / tan(37.5°)
  = 0.651613 · H
```

**Expressing it as a fraction of viewport height is the whole trick for RN.** Remotion is
locked to 1080×1920; a phone is not. Because `f` scales with `H`, the corridor is
resolution-independent for free — every ring lands at the same fraction of screen height
on every device.

A world radius `r` at camera depth `d` projects to a screen radius:

```
R_px = r · f / d          where  f = 0.651613 · H_screen
```

⚠ **The phone is narrower than the render.** 1080×1920 is aspect 0.5625; a 393×852 phone
is 0.461. Matching on height (which is what a vertical fov does) means the phone sees the
same vertical framing and slightly *less* horizontal margin. That is correct behaviour,
not a bug, but near rings will clip the sides a little sooner than they do in the MP4.

---

## 4. The geometry, lifted from `DuelReveal.tsx`

All values are the Remotion corridor's, unchanged. Only the camera's *timing* is re-derived
(§7).

| | value | note |
|---|---|---|
| `COUNT` | 20 | rings in the field |
| `SPACING` | 3.6 | world units between rings |
| `DEPTH` | 72 | `COUNT × SPACING`, the modulo period |
| ring radius | 3.1 | torus major radius |
| ring stroke | 0.10 | torus tube **diameter** (tube radius 0.05) |
| gate radius | 3.35 | thicker, brighter — the clue carriers |
| gate stroke | 0.32 | tube radius 0.16 |
| floor | y = −3.1, 7 wide, 72 long | what makes it a hallway, not a portal |
| mouth | radius 2.9 at z = −56.16 | `−DEPTH × 0.78`; the exit you walk toward |
| fog | linear, near 8, far 158.4 | `DEPTH × 2.2` |
| fog / bg colour | `#04060A` | must match, see §5 |
| camera standoff | +5 | so ring depth `d = 5 − z_world` ∈ [5, 77) |

**Ring depth, per frame:**

```
z_i = −(((i · SPACING − travel) mod DEPTH) + DEPTH) mod DEPTH     // ∈ (−72, 0]
d_i = 5 − z_i                                                     // ∈ [5, 77)
```

**What that projects to** (at H = 1920, so `f` = 1251.1 px — divide by 1920 for the
fraction-of-height that applies on any device):

| depth `d` | ring R | ring stroke | gate R | gate stroke | opacity (§5) |
|---:|---:|---:|---:|---:|---:|
| 5 (passing) | 775.7 | 25.0 | 838.2 | 80.1 | 1.000 |
| 8 | 484.8 | 15.6 | 523.9 | 50.0 | 1.000 |
| 12 | 323.2 | 10.4 | 349.3 | 33.4 | 0.973 |
| 20 | 193.9 | 6.3 | 209.6 | 20.0 | 0.920 |
| 36 | 107.7 | 3.5 | 116.4 | 11.1 | 0.814 |
| 56.16 (mouth) | 69.1 | 2.2 | 74.6 | 7.1 | 0.680 |
| 77 (far) | 50.4 | 1.6 | 54.4 | 5.2 | 0.541 |

⚠ **The stroke is perspective-scaled too.** A constant stroke width is the single fastest
way to flatten this back into concentric circles — the near ring's line is 25px and the far
ring's is 1.6px, a 15× ratio. That ratio *is* the depth cue.

---

## 5. Fog, as opacity

Three's linear fog mixes the material colour toward the fog colour:

```
fogFactor = clamp((d − near) / (far − near), 0, 1)   // = clamp((d − 8) / 150.4, 0, 1)
colour    = mix(materialColour, fogColour, fogFactor)
```

**Because the fog colour and the background are the same `#04060A`, mixing toward fog is
pixel-identical to fading alpha toward 0 on that background.** So Skia can use:

```
opacity = 1 − clamp((d − 8) / 150.4, 0, 1)
```

⚠ This equivalence holds **only while the background is `#04060A`**. At the reveal the
corridor floods the opponent's colour (`lit`), and at the blowout it goes white. During
those beats the mix must be done against the *actual* backdrop or the far rings will
punch dark holes in a bright frame. Simplest correct form: keep the fill as an explicit
`mix(ringColour, backdropColour, fogFactor)` using Skia's `interpolateColors`, and drop
the opacity shortcut entirely once `lit > 0`.

⚠ **Use `interpolateColors` from `@shopify/react-native-skia`, not `interpolateColor` from
Reanimated.** Skia stores colours in a different format; the Reanimated one does not work
here. (Verified in the Skia animations docs.)

---

## 6. The modulo wrap — why this works in Skia and broke in CSS

The ring field wraps: a ring that passes the camera reappears at the far end. That wrap is
a **discontinuity**, and how it is expressed decides whether the corridor works.

> ⚠ THE MODULO WRAP IS SAFE HERE and is not in the DOM twin. Each frame is computed from
> scratch, so a ring jumping from the near end to the far end is one discrete change. A CSS
> transition INTERPOLATES THROUGH the same wrap, which is what sent half the rings
> backwards in the app version.
> — `remotion/DuelReveal.tsx`

**Skia is on the safe side of that line, but only if it is written the right way.**
`useDerivedValue` / `select()` *compute* a value from the clock each frame — no
interpolation between successive outputs — which is the same contract Remotion's
`useCurrentFrame()` gives. But `withTiming` on a wrapped value would reintroduce exactly
the CSS bug.

**Rule: every corridor value is derived from `t.value`. Nothing in the corridor may use
`withTiming`, `withSpring` or `withRepeat`.** The clock is animated; the geometry is
computed.

---

## 7. ⚠ THE OPEN DECISION: the travel curve

This is the one thing I cannot settle from the code, because the two clocks were designed
for different pictures.

`showdownBeats.ts` gives `dolly`, a normalised `0 → 1.04` track built for a **scaling
arch**: it moves only 8% in the first 400ms, because an arch that barely moves during
"Establish" is fine. A corridor is not fine — 8% of the journey means **gate 1 is already
on top of the camera at t = 0** (depth 7.5, radius ≈ 0.45 × screen height), so the film
opens mid-gate instead of establishing a hallway.

Remotion does not have this problem because it derives gate positions *from* its own travel
curve (`GATE_Z = frame × 0.1071`) and gives itself 7.3 seconds to reach the charge.

Three ways out:

**Option 1 — corridor follows `dolly` unchanged.** Zero change to signed-off timing.
Cost: raise the camera standoff from 5 to ~14 so nothing is oversized at t=0 — but then
gates never fill the frame as they pass, and the drama of flying *through* one is gone.

**Option 2 — the corridor gets its own travel track (recommended).** Keep every beat
boundary and clue time exactly as they are. Give travel its own anchors and place the
gates at `travel(t)` for three times that sit *inside* the clue windows rather than at
their starts — which is what Remotion actually does: its clue appears ~1.0s **before** its
gate is passed and leaves ~0.7s after, so the clue is on screen approaching the gate and
blows past with it. Nothing signed off changes; two new constants appear.

**Option 3 — lengthen beat 1 to ~900ms** so there is corridor to establish before clue 1.
Cleanest motion of the three. Costs a signed-off beat boundary and squeezes clue 1 below
`CLUE_MS = 1400`.

**Recommendation: Option 2.** It is the only one that changes nothing Ryan has already
watched and approved, and it reproduces the Remotion clue↔gate relationship rather than
inventing a third one. The concrete anchors need one pass in the Studio against the real
film before they are fixed.

---

## 8. Architecture

Two new files, mirroring how `showdownBeats.ts` and `ShowdownWalkout.tsx` already split.

### `mobile/lib/showdownCorridor.ts` — the maths, pure and tested

⚠ **Same rule as `showdownBeats.ts`: nothing here may import React Native**, not even
`Easing`. The root vitest runner reaches `mobile/**/__tests__` but resolves nothing out of
`mobile/node_modules`, so one RN import takes the file out of coverage.

```ts
export const CORRIDOR = { COUNT: 20, SPACING: 3.6, DEPTH: 72, STANDOFF: 5,
                          RING_R: 3.1, RING_W: 0.10,
                          GATE_R: 3.35, GATE_W: 0.32,
                          FOG_NEAR: 8, FOG_FAR: 158.4 } as const

export const focal      = (h: number) => 0.651613 * h          // px
export const ringDepth  = (i: number, travel: number) => number
export const project    = (r: number, d: number, f: number) => number
export const fogFactor  = (d: number) => number
export const TRAVEL: BeatSeg[]                                  // §7
export const GATE_Z: readonly [number, number, number]
```

All pure, all worklet-safe (`'worklet'` on anything called from the UI thread), all
testable under the existing root vitest run.

### `mobile/components/pool-detail/ShowdownCorridor.tsx` — pixels only

Verified against the RN Skia docs (Reanimated **4.1.6** is installed, so the direct
shared-value-as-prop integration applies with no `createAnimatedComponent`):

- **`<Canvas style={{ flex: 1 }}>`** hosting the whole corridor, sitting *behind* the
  existing arch/figures/clue layers.
- **Rings: 20 × `<Circle style="stroke">`**, a fixed element count so React renders once
  and only the values move. Per-ring `{ r, strokeWidth, opacity }` from a **single**
  `useSharedValue` object read with **`select(ring, 'r')`** etc. — one subscription per
  ring instead of three (`select` is documented for exactly this).
- **Gates: 3 more `<Circle>`**, same treatment, using `GATE_R` / `GATE_W`.
- **Glow: `<BlurMask blur={n} style="solid" />`** as a child of the near rings. `solid`
  keeps the stroke crisp and blooms outside it — the emissive look without a second pass.
  ⚠ Blur is per-shape and not free; apply it only to rings under some depth threshold, and
  profile before widening.
- **Mouth: one `<Circle>`** at the projected radius for `d = 56.16`, white, with a heavier
  `BlurMask`.
- **Floor:** the existing `expo-linear-gradient` already does this job adequately and is
  cheap. Keep it; do not redraw it in Skia in v1.
- **Colour flood at reveal:** `interpolateColors` (Skia's), driven by the same `lit` track
  the Remotion film uses.

**Sizing:** `useWindowDimensions()` → `f = 0.651613 * height`. Everything else falls out.

### Deliberately deferred

- **`<Atlas>` + `useRSXformBuffer`** draws all 20 rings in one call with transforms
  computed in a worklet, and is the documented escape hatch if 23 stroked circles miss
  frame budget. It is *not* the starting point: `RSXform` scales a baked sprite uniformly,
  so per-ring `BlurMask` is unavailable and the glow would have to be baked into the
  texture at one size. Reach for it only with a profile in hand.
- **An SkSL fragment shader** for the whole corridor. Fastest possible, hardest to review,
  and it moves the geometry out of the testable pure module. Not for v1.

---

## 9. How this gets verified

⚠ **Native builds cannot be produced or visually checked on this machine** (iOS has no
simulator destinations; Android's Maven fetch 403s). That constrains the plan:

| what | how | where |
|---|---|---|
| projection maths | unit tests on `showdownCorridor.ts` against the table in §4 | root `npm run test` ✅ |
| wrap has no interpolation | grep guard test — no `withTiming`/`withSpring` in the corridor, mirroring `walkoutWorklets.guard.test.ts` | root `npm run test` ✅ |
| it looks right | side-by-side against `npx remotion studio` → `DuelReveal` | manual, on a device 🔴 |
| frame budget | Skia's own perf overlay on a mid-range Android | on a device 🔴 |
| Skia is linked at all | §2 | **before starting** 🔴 |

The Remotion composition is the reference image throughout: same geometry, same fog, so
any visible divergence is a bug in this port rather than a taste question. That is the main
practical argument for lifting the numbers unchanged.

---

## 10. Sequence

1. **Settle §2** — is Skia in the current native runtime? Everything else depends on it.
2. **Settle §7** — the travel curve, one decision.
3. `showdownCorridor.ts` + tests. Pure, no device needed, verifiable here.
4. `ShowdownCorridor.tsx` behind the existing layers, gated off a flag.
5. Device pass against the Studio, side by side.
6. Retire the neon arch once the corridor carries the shot — **not before**; they are two
   readings of the same beat and running both would double the depth cues.
