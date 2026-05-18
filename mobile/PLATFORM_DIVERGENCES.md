# Platform divergences

Places where the Expo mobile codebase deliberately runs different code on iOS
vs Android, with the rationale and the dates each was introduced. Updated
every time we ship a divergent code path.

Each entry should answer:

- **What differs** — concrete code or value table
- **Why we diverge** — what specifically renders or behaves wrong if iOS and
  Android share the same path
- **What merging would break** — the cost we'd pay to unify

When an upstream fix (RN release, library update, Fabric maturity) makes a
divergence unnecessary, move the entry to **Resolved** with the commit that
unified the paths.

---

## Active divergences

### 2. PoolPreviewSheet header — top padding

**Files:** `app/pool-preview/[id].tsx`
**Introduced:** 2026-05-17 (commit `095425a`, narrowed in subsequent commit)

| Property | iOS | Android |
|---|---|---|
| `paddingTop` of header row | `theme.spacing.xxl` (32) | `insets.top + theme.spacing.md` |

**Why diverge:** iOS modal presentations provide their own safe inset above
the card lip, so a fixed top pad places the title cleanly under the modal
chrome. Android's modal presentation renders edge-to-edge under the system
status bar and notch/camera cutout — without `insets.top` the title is
visually clipped by the cutout.

**What merging would break:**

- Using iOS values on Android → title tucks under the camera cutout.
- Using Android values on iOS → extra blank space at the top of the modal
  card (insets.top doubles the comfortable spacing iOS already provides).

**Note:** the close button divergence that originally accompanied this
entry was resolved by switching both platforms to a cross-platform back
chevron via `Icon` (replacing the iOS-only `SymbolView` close + Android
fallback). Header layout is now unified — only the padding diverges.

---

### 1. LeaderboardRow — current-user row styling

**Files:** `components/pool-detail/LeaderboardRow.tsx`
**Introduced:** 2026-05-17 (commit `e3aac17`)

| Property | iOS | Android |
|---|---|---|
| `backgroundColor` | `withOpacity(theme.colors.primary, 0.08)` | `#E2E6FA` (primary @ 15% pre-blended over white) |
| `borderWidth` | `theme.borders.accent` (1.5pt) | `2` |
| `borderColor` | `withOpacity(theme.colors.primary, 0.25)` | `#B1BDF1` (primary @ 40% pre-blended over white) |

**Why diverge:** Layering a low-opacity border over a low-opacity tinted
background over an `elevation: 2` view renders as a visible "double
container" / inset-ring effect on Android — likely how Android composites
border + bg + elevation through its native RenderThread. Solid pre-blended
hex values bypass the alpha-compositing step entirely. Android also needs
~15%/40% strength to match the visual prominence iOS gets from 8%/25% via
its softer shadow rendering.

**What merging would break:**

- Using iOS values on Android → "your row" blends into the white rows above
  and below; visually indistinguishable from a non-current-user row.
- Using Android values on iOS → too saturated; the tint and 2pt border read
  as an aggressive highlight instead of a subtle "this is you" cue.

---

## Resolved

*(none yet — entries move here once a unified path becomes viable)*

---

## How to add an entry

1. Add a new `### N. <component>` section under **Active divergences**.
2. Include `Files:` and `Introduced:` (date + commit hash) headers.
3. Write a `iOS | Android` value table so the differences are skimmable.
4. Answer "why diverge" and "what merging would break" in one paragraph each.
5. If the divergence later goes away (RN upgrade, library fix, manual unify),
   move the entry to **Resolved** with the unifying commit hash.

## Companion conventions

- Prefer `Platform.OS === 'ios' ? A : B` inside style objects (not separate
  components) so a code reader can see both branches in one place.
- For divergent constants (pre-blended hex values, behavior strings, etc.),
  keep both literals at the call site with `// iOS/...` and `// Android/...`
  comments rather than hiding them in a `Platform.select` block, so the
  diff is obvious.
- Every divergence belongs in this log. If you introduce one in a PR/commit
  and forget to log it, the next person debugging cross-platform behavior
  pays the price.
