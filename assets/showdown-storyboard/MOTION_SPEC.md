# Showdown Tunnel Walk-Out Reveal — Motion Spec v0.1

Working draft for the 4-second tunnel walk-out reveal animation that introduces a Showdown matchup. Companion to the storyboard frames in this directory (one folder per mood candidate).

The animation surfaces in three places:

1. **In-app on mobile (Expo)** — plays when a player opens a new matchup card.
2. **In-app on web (Next.js)** — same playback on the web pool feed.
3. **Shareable artifact** — v1: a static OG image of the final beat (`next/og`). v1.1 (optional): a 4s MP4 (Remotion render) for true video share to WhatsApp/iMessage.

The animation is identical across surfaces; what changes is the playback medium (native runtime vs server-rendered MP4).

---

## Constraints driving the spec

- **4 seconds total.** Long enough to land a beat structure, short enough not to skip on the second view. Confirmed v1; A/B against 3s and 5s in v1.1.
- **Looks great muted.** No audio in v1 — shareable artifacts default to silent on WhatsApp. Motion must read without sound design.
- **Replays acceptably.** Second viewing should still feel decent, not annoying. Biases toward graceful fades over sharp cuts at the loop/end.
- **Works portrait and landscape.** 9:16 mobile in-app, 16:9 web share preview. Composition must work in both — no edge-locked elements.
- **Names + matchup card legible at WhatsApp preview size** (~400px wide). Final beat must read at thumbnail scale.

---

## Beat structure (shared across all moods)

The narrative arc is constant. Mood is a surface treatment that swaps the visual style without changing the timing or beats.

| # | Beat | Window | Dur | What's on screen | Camera motion | Easing |
| - | --- | --- | --- | --- | --- | --- |
| 1 | Establish | 0.0s – 0.4s | 0.4s | Dark tunnel interior, distant bright opening | Slow dolly forward | `ambient` (linear) |
| 2 | Atmosphere build | 0.4s – 1.0s | 0.6s | Tunnel walls visible, light shafts, smoke | Continued dolly, slight acceleration | `anticipate` (ease-in-cubic) |
| 3 | Silhouettes emerge | 1.0s – 1.4s | 0.4s | Two backlit figures appear midground | Dolly continues, brief anticipation hold at end | `ambient` (linear) |
| 4 | Stride forward | 1.4s – 1.9s | 0.5s | Figures clearer, mid-stride | Dolly slows, figures move into camera | `reveal` (ease-out-quart) |
| 5 | **Threshold (climax)** | 1.9s – 2.2s | 0.3s | Figures cross tunnel → stadium light | **Camera shake (~3px), lens flare peak** | `climax` (overshoot/back-out) |
| 6 | Full reveal | 2.2s – 2.7s | 0.5s | Figures fully lit, venue visible | Camera holds, slight push-in | `settle` (ease-out-cubic) |
| 7 | Hero shot | 2.7s – 3.3s | 0.6s | Squared off, name plates rise from bottom | Camera locks | `hero` (ease-out-quint) for name plates |
| 8 | Lock card | 3.3s – 4.0s | 0.7s | Final composition, "GAMEWEEK X" + matchup graphic | Static | `graphic` (ease-in-out-cubic) for fade-in |

### Why these timings

- **Setup is 1.4s** (beats 1–3). Anticipation needs at least a beat-and-a-half to land; anything shorter feels rushed.
- **Threshold (climax) is the shortest beat (0.3s).** Climax beats should be *fast* — quick hits feel powerful, long climaxes feel pretentious.
- **Lock card holds 0.7s.** This is the share-preview frame. Needs enough hang time for the eye to settle on the matchup before the loop or skip.
- **Two real "moments"** — silhouettes emerge (anticipation) + threshold (release). The rest is connective tissue.

---

## Easing reference

Drop these directly into Reanimated, Framer Motion, or CSS `transition-timing-function`.

```ts
// Reusable across mobile (Expo + Reanimated) and web (Next.js + Framer/CSS)
export const SHOWDOWN_EASINGS = {
  ambient:    'cubic-bezier(0, 0, 1, 1)',         // linear
  anticipate: 'cubic-bezier(0.32, 0, 0.67, 0)',   // ease-in-cubic
  reveal:     'cubic-bezier(0.25, 1, 0.5, 1)',    // ease-out-quart
  climax:     'cubic-bezier(0.34, 1.56, 0.64, 1)', // overshoot (back.out)
  settle:     'cubic-bezier(0.33, 1, 0.68, 1)',   // ease-out-cubic
  hero:       'cubic-bezier(0.22, 1, 0.36, 1)',   // ease-out-quint
  graphic:    'cubic-bezier(0.65, 0, 0.35, 1)',   // ease-in-out-cubic
} as const;
```

---

## Element layers (z-order, foreground → background)

1. **UI overlay** — beats 7–8 only. Name plates, "GAMEWEEK X" graphic, matchup card.
2. **Hero subjects** — the two player avatars/silhouettes. On screen beats 3–8.
3. **Atmosphere** — smoke, light shafts, lens flare. Beats 2–6.
4. **Mid-tunnel walls** — concrete/decorative texture. Beats 1–4.
5. **Distant background** — venue visible through the doorway. Beat 1, then beats 5–8 once revealed.

Layering is mood-agnostic. Swapping the mood changes how each layer is rendered, not which layers exist.

---

## Per-mood treatment

Same 8 beats, different visual languages. Pick one for v1; the others can be A/B-tested in v1.1 or offered as cosmetic themes later.

### Mood A — Cinematic & serious
- **Reference:** UEFA Champions League opener, UFC pay-per-view walk-out, FIFA World Cup intro
- **Palette:** Deep navy `#0a1a3e`, gold `#d4af37`, atmospheric black
- **Lighting:** Single strong key light from beyond the tunnel; long shadows
- **Subjects:** Anonymous male athletes, professional poses, weighty stride
- **Background reveal:** Massive stadium with crowd silhouettes and floodlights
- **Name plates:** Lower-third broadcast graphics, gold accent line
- **Typography:** Strong serif or condensed sans for "GAMEWEEK X" (Champions League "MATCHDAY 3" treatment)
- **Best for:** Pools that take themselves seriously, office Fantasy crowds, pro-football leagues

### Mood B — Hyped & high-energy
- **Reference:** EA Sports FC video game intro, NBA on TNT, NHL playoff promos
- **Palette:** Cyan `#00e5ff`, magenta `#ff00aa`, electric green `#39ff14`, black
- **Lighting:** Pulsing neon strips along tunnel walls; lens flare peaks at threshold
- **Subjects:** Anonymous athletes, dynamic poses, motion blur
- **Background reveal:** Futuristic stadium with LED ribbons, neon crowd lights
- **Name plates:** Kinetic motion graphics with stat overlays
- **Typography:** Bold sans with neon glow, possibly angled
- **Best for:** Younger crowd, e-sports adjacent, mobile-first vibe

### Mood C — Irreverent & meme-y
- **Reference:** NFL Sunday Night Football's intro played as parody, classic WWE promos
- **Palette:** Oversaturated americana — red, white, blue, deliberately too-much-gloss
- **Lighting:** Theatrical, over-the-top, almost stage-musical
- **Subjects:** *Normal office mates in casual clothes* — hoodie, jacket, pint in hand — but treated with broadcast-grand reverence. **The contrast is the joke.**
- **Background reveal:** Comically grand stadium with funny touches (oversized novelty signs, people holding pints)
- **Name plates:** Bold blocky NFL-style with absurd fake stats ("Prediction Accuracy: 23%")
- **Typography:** Big chunky sans with shadow + gradient (over the top)
- **Best for:** Office pools where everyone knows each other, pub-league friend groups, the "we know this is silly" crowd

### Mood D — Office-pool friendly
- **Reference:** Sunday League amateur football, FA People's Cup, local pub vibes
- **Palette:** Warm gold `#f4a850`, pub brown `#3e2912`, cream `#f5e8d4`
- **Lighting:** Practical lights only — string lights, pub neon, table lamps; golden-hour warmth
- **Subjects:** Two regular guys in casual clothes, character-forward
- **Background reveal:** Pub interior with mates cheering, pints raised — or amateur pitch with floodlights at dusk
- **Name plates:** Hand-written / chalkboard aesthetic
- **Typography:** Friendly slab-serif or hand-drawn for "GAMEWEEK X"
- **Best for:** Friend-and-family pools, Sunday League crowds, the "this is supposed to be fun" set

---

## Skip / replay behavior

- **First time viewing:** full 4-second playback. Skip button hidden until t=1.5s.
- **Subsequent views:** skip button visible immediately; skipping jumps directly to beat 8 (lock card).
- **Tap-to-skip area:** full screen on mobile; skip CTA bottom-right on web.
- **Auto-loop:** NO. Single playback, then static on the lock card. Replay via a small "↻" icon on the matchup card.
- **Reduced-motion preference:** skip beats 1–7 entirely, render lock card with a 0.4s opacity fade-in. Honors `prefers-reduced-motion` on web and `isReduceMotionEnabled` in Expo.

---

## Per-pairing data injection

The animation template stays constant. These values are injected per matchup at render time:

| Token | Type | Notes |
| --- | --- | --- |
| `playerA.avatarUrl` | string \| null | Supabase storage URL, pre-resolved. **Nullable** — `null` for users without uploaded avatars (the v1 case for everyone). The name-plate chip falls back to initials-on-colour. |
| `playerA.displayName` | string | Cap at 14 chars for legibility |
| `playerA.initial` | string | First letter of `displayName`, used when `avatarUrl` is null |
| `playerA.colourHash` | string | Deterministic colour from user_id; same user, same colour, forever. Used for the initials-chip background |
| `playerB.*` | same as A | |
| `gameweek.number` | number | e.g. 3 → "GAMEWEEK 3" |
| `gameweek.label` | string? | Optional override (e.g. "BOXING DAY") |
| `h2h.lastFive` | string[] | e.g. `['W','L','W','D','W']` — surfaces in beat 7 form-guide chip |

**Name-plate chip rendering logic:**
- If `avatarUrl` exists: render small circle photo (24×24) inside the chip beside the name.
- If `avatarUrl` is null: render initials-on-`colourHash` circle (24×24) beside the name.
- Animation timing identical in both cases. This is a content swap, not a template swap.

Avatars (when present) resolve before render kicks off; pre-resolved URLs go in as plain image sources. No render-time fetching.

### Forward compatibility (Phase 3c+ cosmetics)

The animation is authored so the hero-subject layer (the figure silhouettes shown in beats 3–7) is a **distinct z-layer that can be replaced without changing timing, easing, or beat structure.** In the v1 design, that layer is a generic athlete silhouette (mood-themed). In a future world where character avatars + cosmetics ship (see [[project-backlog-avatar-cosmetics]]), this layer becomes the user's customized character with equipped cosmetic items rendered in. Same template, swapped content.

The tunnel/atmosphere/lighting/UI layers are independent of the hero-subject layer, so they can also be swapped — e.g. a "Champions League tunnel" cosmetic theme vs. a "neon arcade tunnel" cosmetic theme — without touching timing or beats. This is what makes the originally-rejected Hyped / Irreverent / Office-pool moods viable as future unlockable cosmetic themes.

**The takeaway for v1 implementation:** keep the figure layer and tunnel-theme layer as separate, replaceable concerns. Hard-coding the silhouettes into the same render pass as the lighting saves time now but blocks future cosmetics. Five extra minutes of layer separation now saves a rewrite later.

---

## Surface-specific implementation notes

### Mobile (Expo)
- **Stack:** Reanimated 3 + Skia. Skia handles light-shaft and lens-flare compositing; Reanimated drives timing and easing.
- 60fps native frame rate target.
- Avatars pre-cached via `expo-image` with `priority="high"`.
- Mounts inside the matchup-card screen on first open per matchup; persists `viewed_at` in Supabase so it doesn't auto-play again.

### Web (Next.js)
- **Stack:** CSS animations + Framer Motion for the same beat structure.
- 60fps target.
- Same `viewed_at` persistence as mobile.

### Share artifact — v1 (static)
- **Stack:** `next/og` route at `/api/og/showdown-matchup?a={uuid}&b={uuid}&gw={n}`
- Renders the **beat 8 composition** as a static 1200×630 PNG.
- Cached by URL params; cache key = matchup ID.
- OG image on the matchup share page; embedded in WhatsApp/iMessage previews.

### Share artifact — v1.1 (optional MP4)
- **Stack:** Remotion composition mirroring the on-app reveal.
- Server-rendered on Vercel or Remotion Lambda.
- 4s MP4 at 1080×1920 (vertical) for WhatsApp story; or 1080×1080 square for chat.
- Gate behind v1 telemetry — only ship if static OG image is moving the share-rate needle and we're confident the video pushes it further.

---

## Open questions to settle during the prep spike

- **Mood pick for v1** — needs storyboard frames + your gut.
- **Stadium vs venue scope** — does it have to be a stadium (heavy), or could it be more abstract (lighter)? Easier to swap per mood than commit globally.
- **Portrait camera handling** — does the dolly translate to portrait, or does portrait stay static while figures move into camera? Likely the latter; needs prototyping.
- **Name-plate legibility threshold** — 14-char cap is a guess. Test at WhatsApp preview size before committing.
- **H2H form guide on beat 7** — text chip ("W L W D W") or visual pip row? Affects share-preview reading at small size.

---

## Status

- v0.1 (Jun 7, 2026) — Initial spec. Beat structure, easing, layering, four mood treatments, surface notes. Awaiting storyboard frames (blocked on Gemini billing) to pair with the mood treatments.

Related files:
- `assets/showdown-storyboard/{cinematic,hyped,irreverent,office-pool}/frame-*.png` — storyboard frames (pending generation)
- `memory/project_backlog_showdown_animations.md` — stack rationale (Remotion vs Lottie vs Skia)
- `memory/project_backlog_showdown_prep.md` — Phase 3a.pre scope this spec belongs to
- `memory/project_backlog_showdown.md` — full Showdown mode spec
