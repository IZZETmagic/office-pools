# Locked earring assets

**These files are frozen.** They do not get regenerated, re-traced, re-extracted or "improved"
without an explicit request naming the asset. Same rule as `../../bases/LOCKED.md`.

| asset | notes |
|---|---|
| `e01-stud.asset.svg` | solid · one circle per lobe |
| `e02-hoop.asset.svg` | ring · traced SOLID, its hole subtracted |
| `e03-drop.asset.svg` | solid · stud, bar, teardrop |
| `e04-bighoop.asset.svg` | ring · traced as a genuine ring, nothing to subtract |

Locked 2026-09-22, after Ryan reviewed the set.

## The contract

One token, `rgb(212,160,54)`, taken verbatim from `--metal-colour`. **One flat tone**: the
generated art carries no second highlight tone, so there is nothing to derive and no derivation
to keep in step.

⭐⭐ **AN EARRING IS PAINTED WITH THE EAR** — first in the stack, before anything that could
cover it. Ryan: *"if you can't see the ears then there should be no seen earring."* This is the
opposite call to the eyewear, and for a reason: glasses sit on the FACE, where hair falling
across them reads as broken; an earring hangs on the EAR, where hair covering it is just what
happens. Painting it with the ear makes the rule automatic — no per-style flag, no coverage test.

⚠ Binary in practice: only `f09-midwavy` and `m15-locs` reach the ear at all, and both cover it
COMPLETELY. An earring is fully visible or fully hidden, never half-eaten.

⚠⚠ **A HOOP'S HOLE IS A REAL HOLE**, cut by subtraction, and it traces in **WHITE** rather than
skin because a hoop hangs off the head into the background. ⚠ The EAR is not a hole: it is a
base colour inside the ear zone that OVERLAPS the stud painted on it, so a hole must be one
CONTAINED IN THE METAL'S OWN GEOMETRY.

## Verifying

```sh
shasum -a 256 -c LOCKED.sha256
uv run ../../build-builder.py        # after ANY asset change — two tracked bundles depend on it
npx vitest run lib/design/__tests__/avatarAssets.guard.test.ts
```

⭐ A guard test measures each hoop's area against its own convex hull: a solid shape scores
1.00, `e02-hoop` scores 0.54 and `e04-bighoop` 0.33. If the extractor's containment test ever
stops working and a hoop ships as a solid lozenge of gold, that number jumps and the build fails.
